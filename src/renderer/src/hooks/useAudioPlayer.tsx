import { useEffect, useRef, useState } from 'react'
import { getStoredTtsEngine } from '../utils/tts'
import {
  buildCacheKey,
  AUDIO_CACHE_LIMIT,
  DECODED_AUDIO_CACHE_LIMIT,
  concatUint8Arrays,
  createPcmAudioBuffer,
  getCachedAudioFromDisk,
  openAudioCache,
  pruneDiskCache,
  setCachedAudioOnDisk
} from './audioPlayer/cache'
import {
  DEFAULT_CROSSFADE_SEC,
  DEFAULT_INITIAL_BUFFER,
  DEFAULT_STEADY_BUFFER,
  BACKEND_BASE_URL,
  ENABLE_PREWARM,
  getBatchRampForEngine,
  getBatchSizeStandardForEngine,
  getBufferWindowForEngine,
  getMaxTtsCharsForEngine,
  getPlaybackRateForEngine,
  getStoredTtsSpeed,
  getStoredXttsQualityMode,
  getXttsBufferTargets,
  MAX_CROSSFADE_SEC,
  LOW_END_INITIAL_BUFFER,
  LOW_END_STEADY_BUFFER,
  shouldStreamXttsFirstBatch,
  XTTS_BUFFERED_FADE_SEC,
  STREAM_CHUNK_FADE_SEC,
  STREAM_INITIAL_PCM_BYTES,
  STREAM_STEADY_PCM_BYTES
} from './audioPlayer/config'
import {
  AudioBatch,
  AudioPlayerProps,
  AudioResult,
  CachedAudio,
  EMPTY_BUFFER_STATE,
  HighlightTrigger,
  PlaybackBufferState
} from './audioPlayer/types'
import {
  buildBatches,
  estimateSentenceStartOffsets,
  estimateXttsBatchPlaybackSeconds,
  getXttsJoinGapForBatch,
  IMAGE_PAUSE_SEC,
  XTTS_MAX_BUFFERED_BATCHES
} from './audioPlayer/batching'

const HIGHLIGHT_TRIGGER_DELAY_SEC = 0.03
const SILENCE_TRIM_PADDING_SEC = 0.025
const SILENCE_TRIM_MIN_REDUCTION_SEC = 0.04

const trimDecodedAudioBuffer = (ctx: AudioContext, audioBuffer: AudioBuffer) => {
  const { length, numberOfChannels, sampleRate } = audioBuffer
  if (length <= 0 || sampleRate <= 0) return audioBuffer

  const scanStep = Math.max(1, Math.floor(sampleRate / 4000))
  let peak = 0

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    for (let i = 0; i < length; i += scanStep) {
      const value = Math.abs(data[i])
      if (value > peak) peak = value
    }
  }

  if (peak < 0.002) return audioBuffer

  const threshold = Math.max(0.0015, peak * 0.018)
  const hasSignalAt = (sampleIndex: number) => {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      if (Math.abs(audioBuffer.getChannelData(channel)[sampleIndex]) > threshold) {
        return true
      }
    }
    return false
  }

  let firstSignal = 0
  while (firstSignal < length && !hasSignalAt(firstSignal)) {
    firstSignal += scanStep
  }

  let lastSignal = length - 1
  while (lastSignal > firstSignal && !hasSignalAt(lastSignal)) {
    lastSignal -= scanStep
  }

  const padding = Math.round(SILENCE_TRIM_PADDING_SEC * sampleRate)
  const trimStart = Math.max(0, firstSignal - padding)
  const trimEnd = Math.min(length, lastSignal + padding)
  const trimmedLength = trimEnd - trimStart

  if (
    trimmedLength <= 0 ||
    (length - trimmedLength) / sampleRate < SILENCE_TRIM_MIN_REDUCTION_SEC
  ) {
    return audioBuffer
  }

  const trimmed = ctx.createBuffer(numberOfChannels, trimmedLength, sampleRate)
  for (let channel = 0; channel < numberOfChannels; channel++) {
    trimmed.copyToChannel(audioBuffer.getChannelData(channel).slice(trimStart, trimEnd), channel)
  }

  return trimmed
}

export function useAudioPlayer({
  bookStructure,
  visualPageIndex
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')
  const [buffering, setBuffering] = useState<PlaybackBufferState>(EMPTY_BUFFER_STATE)

  const isPlayingRef = useRef(false)
  const isPausedRef = useRef(false)
  const stopSignalRef = useRef(false)
  const highlightedSentenceIndexRef = useRef(-1)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const playbackEndTimeRef = useRef(0)
  const highlightScheduleRef = useRef<HighlightTrigger[]>([])
  const highlightCursorRef = useRef(0)
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())

  // Session Tracking
  const currentSessionId = useRef<string>('')
  const audioCacheRef = useRef<Map<string, CachedAudio>>(new Map())
  const audioCacheKeysRef = useRef<string[]>([])
  const decodedAudioCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const decodedAudioCacheKeysRef = useRef<string[]>([])
  const audioCacheDbRef = useRef<IDBDatabase | null>(null)
  const prewarmTimeoutRef = useRef<number | null>(null)
  const streamAbortControllerRef = useRef<AbortController | null>(null)

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }

  const stopActiveSources = () => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop()
      } catch {}
      try {
        source.disconnect()
      } catch {}
    }
    activeSourcesRef.current.clear()
  }

  const scheduleAudioBuffer = (
    ctx: AudioContext,
    audioBuffer: AudioBuffer,
    fadeSec: number,
    options?: { joinGapSec?: number; playbackRate?: number }
  ) => {
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer

    const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
    const gainNode = ctx.createGain()
    const playbackRate = Math.max(0.5, options?.playbackRate ?? 1)
    source.playbackRate.value = playbackRate
    const effectiveDuration = audioBuffer.duration / playbackRate
    const safeFadeSec = Math.min(fadeSec, effectiveDuration * 0.25)
    const joinGapSec = Math.max(0, options?.joinGapSec ?? 0)

    if (safeFadeSec > 0) {
      gainNode.gain.setValueAtTime(0, start)
      gainNode.gain.linearRampToValueAtTime(1, start + safeFadeSec)
      gainNode.gain.setValueAtTime(1, Math.max(start, start + effectiveDuration - safeFadeSec))
      gainNode.gain.linearRampToValueAtTime(0, start + effectiveDuration)
    } else {
      gainNode.gain.setValueAtTime(1, start)
    }

    source.connect(gainNode)
    gainNode.connect(ctx.destination)
    activeSourcesRef.current.add(source)
    source.onended = () => {
      activeSourcesRef.current.delete(source)
      try {
        source.disconnect()
      } catch {}
      try {
        gainNode.disconnect()
      } catch {}
    }

    source.start(start)
    const overlap = Math.min(safeFadeSec, effectiveDuration * 0.25)
    const endTime = start + effectiveDuration
    nextStartTimeRef.current = Math.max(start + 0.02, endTime - overlap + joinGapSec)
    playbackEndTimeRef.current = endTime

    return { start, endTime }
  }

  const setDecodedCache = (key: string, value: AudioBuffer) => {
    const cache = decodedAudioCacheRef.current
    if (!cache.has(key)) {
      decodedAudioCacheKeysRef.current.push(key)
    }
    cache.set(key, value)

    if (decodedAudioCacheKeysRef.current.length > DECODED_AUDIO_CACHE_LIMIT) {
      const oldest = decodedAudioCacheKeysRef.current.shift()
      if (oldest) cache.delete(oldest)
    }
  }

  const decodeToBuffer = async (
    key: string,
    result: CachedAudio
  ): Promise<AudioBuffer | null> => {
    const cachedBuffer = decodedAudioCacheRef.current.get(key)
    if (cachedBuffer) return cachedBuffer

    const ctx = audioCtxRef.current
    if (!ctx || !result.audio_data) return null
    try {
      const rawData = result.audio_data
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer
      const decoded = await ctx.decodeAudioData(cleanBuffer)
      const playableBuffer = trimDecodedAudioBuffer(ctx, decoded)
      setDecodedCache(key, playableBuffer)
      return playableBuffer
    } catch (err) {
      console.error('Decode Error', err)
      return null
    }
  }

  const setCache = (key: string, value: CachedAudio) => {
    const cache = audioCacheRef.current
    if (!cache.has(key)) {
      audioCacheKeysRef.current.push(key)
    }
    cache.set(key, value)

    if (audioCacheKeysRef.current.length > AUDIO_CACHE_LIMIT) {
      const oldest = audioCacheKeysRef.current.shift()
      if (oldest) cache.delete(oldest)
    }
  }

  useEffect(() => {
    let isMounted = true
    openAudioCache()
      .then((db) => {
        if (isMounted) audioCacheDbRef.current = db
      })
      .catch(() => {})
    return () => {
      isMounted = false
      if (audioCacheDbRef.current) {
        audioCacheDbRef.current.close()
        audioCacheDbRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!ENABLE_PREWARM) return
    if (isPlayingRef.current) return
    if (!bookStructure.allSentences.length || !bookStructure.sentenceToPageMap.length) return

    if (prewarmTimeoutRef.current) window.clearTimeout(prewarmTimeoutRef.current)
    prewarmTimeoutRef.current = window.setTimeout(async () => {
      const lowEndMode = localStorage.getItem('low_end_mode') === 'true'
      const engine = getStoredTtsEngine()
      const xttsQuality = getStoredXttsQualityMode()
      const batchRamp = getBatchRampForEngine(engine, lowEndMode, xttsQuality)
      const batchSizeStandard = getBatchSizeStandardForEngine(engine, lowEndMode, xttsQuality)
      const maxTtsChars = getMaxTtsCharsForEngine(engine, lowEndMode, xttsQuality)

      const batches = buildBatches(
        bookStructure,
        visualPageIndex,
        engine,
        lowEndMode,
        xttsQuality,
        batchRamp,
        batchSizeStandard,
        maxTtsChars
      )
      const firstBatch = batches[0]
      if (!firstBatch || firstBatch.text === '[[[IMAGE]]]' || !firstBatch.text.trim()) return

      const voicePath =
        engine === 'piper'
          ? localStorage.getItem('piper_model_path')
          : localStorage.getItem('custom_voice_path')
      const speed = getStoredTtsSpeed()
      const cacheKey = buildCacheKey(firstBatch.text, engine, voicePath, speed, xttsQuality)
      const cached = audioCacheRef.current.get(cacheKey)
      if (cached) return

      const db = audioCacheDbRef.current
      if (db) {
        const diskHit = await getCachedAudioFromDisk(db, cacheKey)
        if (diskHit) {
          setCache(cacheKey, diskHit)
          return
        }
      }

      const result = await window.api.generate(firstBatch.text, speed, 'prewarm', {
        engine: engine,
        voicePath: voicePath,
        quality_mode: xttsQuality
      })
      if (result?.status === 'success' && result.audio_data) {
        setCache(cacheKey, result as CachedAudio)
        if (db) {
          await setCachedAudioOnDisk(db, cacheKey, result.audio_data)
          await pruneDiskCache(db)
        }
      }
    }, 350)

    return () => {
      if (prewarmTimeoutRef.current) window.clearTimeout(prewarmTimeoutRef.current)
    }
  }, [visualPageIndex, bookStructure.allSentences, bookStructure.sentenceToPageMap])

  const pause = async () => {
    if (!isPlayingRef.current || isPausedRef.current) return
    console.log('Pausing...')

    isPausedRef.current = true
    setIsPaused(true)

    if (audioCtxRef.current) {
      await audioCtxRef.current.suspend()
    }
    setStatus('Paused')
  }

  const stop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    isPausedRef.current = false

    currentSessionId.current = ''
    await window.api.setSession('')

    setIsPlaying(false)
    setIsPaused(false)
    setStatus('Stopped')
    setBuffering(EMPTY_BUFFER_STATE)
    setGlobalSentenceIndex(-1)
    highlightedSentenceIndexRef.current = -1

    highlightScheduleRef.current = []
    highlightCursorRef.current = 0
    playbackEndTimeRef.current = 0
    nextStartTimeRef.current = 0
    streamAbortControllerRef.current?.abort()
    streamAbortControllerRef.current = null
    stopActiveSources()

    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state === 'running') {
          await audioCtxRef.current.suspend()
        }
      } catch (e) {
        console.error(e)
      }
    }

    await window.api.stop()
  }

  const play = async () => {
    if (isPausedRef.current) {
      console.log('Resuming...')
      isPausedRef.current = false
      setIsPaused(false)
      if (audioCtxRef.current) {
        await audioCtxRef.current.resume()
      }
      setStatus('Resuming...')
      return
    }

    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    isPausedRef.current = false
    setIsPlaying(true)
    setIsPaused(false)
    highlightScheduleRef.current = []
    highlightCursorRef.current = 0
    setGlobalSentenceIndex(-1)
    highlightedSentenceIndexRef.current = -1
    playbackEndTimeRef.current = 0
    streamAbortControllerRef.current?.abort()
    streamAbortControllerRef.current = null
    stopActiveSources()

    initAudioContext()

    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    const newSessionId = Date.now().toString()
    currentSessionId.current = newSessionId
    await window.api.setSession(newSessionId)

    const engine = getStoredTtsEngine()
    const lowEndMode = localStorage.getItem('low_end_mode') === 'true'
    const xttsQuality = getStoredXttsQualityMode()
    const batchRamp = getBatchRampForEngine(engine, lowEndMode, xttsQuality)
    const batchSizeStandard = getBatchSizeStandardForEngine(engine, lowEndMode, xttsQuality)
    const maxTtsChars = getMaxTtsCharsForEngine(engine, lowEndMode, xttsQuality)
    const initialDefault = lowEndMode ? LOW_END_INITIAL_BUFFER : DEFAULT_INITIAL_BUFFER
    const steadyDefault = lowEndMode ? LOW_END_STEADY_BUFFER : DEFAULT_STEADY_BUFFER
    const storedInitial = Number(localStorage.getItem('audio_buffer_initial'))
    const storedSteady = Number(localStorage.getItem('audio_buffer_steady'))
    const storedCrossfadeMs = Number(localStorage.getItem('audio_crossfade_ms'))
    const initialBuffer =
      Number.isFinite(storedInitial) && storedInitial > 0 ? storedInitial : initialDefault
    const steadyBuffer =
      Number.isFinite(storedSteady) && storedSteady > 0 ? storedSteady : steadyDefault
    const { initialBuffer: effectiveInitialBuffer, steadyBuffer: effectiveSteadyBuffer } =
      getBufferWindowForEngine(engine, initialBuffer, steadyBuffer)
    const fadeSec = Number.isFinite(storedCrossfadeMs)
      ? Math.min(MAX_CROSSFADE_SEC, Math.max(0, storedCrossfadeMs / 1000))
      : DEFAULT_CROSSFADE_SEC
    const bufferedFadeSec =
      engine === 'chatterbox' ? Math.min(fadeSec, XTTS_BUFFERED_FADE_SEC) : fadeSec
    const xttsBufferTargets =
      engine === 'chatterbox' ? getXttsBufferTargets(lowEndMode, xttsQuality) : null

    const batches = buildBatches(
      bookStructure,
      visualPageIndex,
      engine,
      lowEndMode,
      xttsQuality,
      batchRamp,
      batchSizeStandard,
      maxTtsChars
    )

    const audioPromises: Array<Promise<AudioResult> | null> = new Array(batches.length).fill(null)
    const decodedBuffers: Array<AudioBuffer | null> = new Array(batches.length).fill(null)
    const voicePath =
      engine === 'piper'
        ? localStorage.getItem('piper_model_path')
        : localStorage.getItem('custom_voice_path')
    const speed = getStoredTtsSpeed()
    const playbackRate = getPlaybackRateForEngine(engine, speed)
    const getDesiredBufferSize = (startIndex: number, fallback: number) => {
      if (engine !== 'chatterbox' || !xttsBufferTargets) {
        return fallback
      }

      const targetSeconds =
        startIndex <= 0 ? xttsBufferTargets.initialSeconds : xttsBufferTargets.steadySeconds
      let estimatedSeconds = 0
      let count = 0

      for (
        let batchIndex = startIndex;
        batchIndex < batches.length && count < XTTS_MAX_BUFFERED_BATCHES;
        batchIndex++
      ) {
        estimatedSeconds += estimateXttsBatchPlaybackSeconds(batches[batchIndex], playbackRate)
        count++
        if (estimatedSeconds >= targetSeconds) {
          break
        }
      }

      return Math.max(fallback, count)
    }

    let bufferSize = getDesiredBufferSize(0, effectiveInitialBuffer)
    let hasStartedPlayback = false
    const isSessionStale = () =>
      stopSignalRef.current || currentSessionId.current !== newSessionId

    const markPlaybackStarted = () => {
      if (!hasStartedPlayback) {
        setBuffering(EMPTY_BUFFER_STATE)
        setStatus('Reading...')
        hasStartedPlayback = true
      }
    }

    const updateBufferingUi = (readySeconds: number, targetSeconds: number) => {
      if (hasStartedPlayback) return

      const safeTarget = Math.max(targetSeconds, 0.1)
      const clampedReady = Math.min(readySeconds, targetSeconds)
      const progress = Math.min(1, clampedReady / safeTarget)

      if (engine === 'chatterbox') {
        setBuffering({
          active: true,
          engine,
          progress,
          readySeconds: clampedReady,
          targetSeconds,
          label: 'Preparing narration',
          detail: `Building a smooth opening buffer so playback can stay continuous.`
        })
        setStatus(`Preparing narration ${Math.round(progress * 100)}%`)
        return
      }

      setBuffering({
        active: true,
        engine,
        progress,
        readySeconds: clampedReady,
        targetSeconds,
        label: engine === 'piper' ? 'Loading voice' : 'Preparing audio',
        detail:
          engine === 'piper'
            ? 'Getting the voice ready for playback.'
            : 'Loading the first playback segment.'
      })
      setStatus(engine === 'piper' ? 'Loading voice...' : 'Buffering...')
    }

    const triggerGeneration = (index: number) => {
      if (index >= batches.length || audioPromises[index] || isSessionStale()) return
      const batch = batches[index]

      if (batch.text === '[[[IMAGE]]]') {
        audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
      } else {
        const cacheKey = buildCacheKey(batch.text, engine, voicePath, speed, xttsQuality)
        const cached = audioCacheRef.current.get(cacheKey)

        const resolveAndMaybeDecode = async () => {
          const db = audioCacheDbRef.current
          if (db) {
            const diskHit = await getCachedAudioFromDisk(db, cacheKey)
            if (diskHit) {
              setCache(cacheKey, diskHit)
              const decoded = await decodeToBuffer(cacheKey, diskHit)
              decodedBuffers[index] = decoded
              return diskHit
            }
          }

          if (isSessionStale()) {
            return { status: 'cancelled', audio_data: null }
          }

          const result = await window.api.generate(batch.text, speed, newSessionId, {
            engine: engine,
            voicePath: voicePath,
            quality_mode: xttsQuality
          })

          if (result?.status === 'success' && result.audio_data) {
            setCache(cacheKey, result as CachedAudio)
            if (db) {
              await setCachedAudioOnDisk(db, cacheKey, result.audio_data)
              await pruneDiskCache(db)
            }
            const decoded = await decodeToBuffer(cacheKey, result as CachedAudio)
            decodedBuffers[index] = decoded
          }
          return result
        }

        if (cached) {
          audioPromises[index] = Promise.resolve(cached).then(async (result) => {
            const decoded = await decodeToBuffer(cacheKey, result as CachedAudio)
            decodedBuffers[index] = decoded
            return result
          })
        } else {
          audioPromises[index] = resolveAndMaybeDecode()
        }
      }
    }

    const supportsFirstBatchStreaming =
      engine === 'piper' ||
      (engine === 'chatterbox' && shouldStreamXttsFirstBatch(lowEndMode, xttsQuality))
    const firstBatch = batches[0]
    const firstBatchCacheKey =
      firstBatch && firstBatch.text !== '[[[IMAGE]]]'
        ? buildCacheKey(firstBatch.text, engine, voicePath, speed, xttsQuality)
        : null
    let firstBatchCached = false

    if (firstBatchCacheKey) {
      if (audioCacheRef.current.has(firstBatchCacheKey)) {
        firstBatchCached = true
      } else if (audioCacheDbRef.current) {
        const diskHit = await getCachedAudioFromDisk(audioCacheDbRef.current, firstBatchCacheKey)
        if (diskHit) {
          setCache(firstBatchCacheKey, diskHit)
          firstBatchCached = true
        }
      }
    }

    let shouldStreamFirstBatch =
      supportsFirstBatchStreaming &&
      firstBatch?.text !== '[[[IMAGE]]]' &&
      firstBatch?.globalIndices.length === 1

    if (shouldStreamFirstBatch && firstBatchCached) {
      shouldStreamFirstBatch = false
    }

    const streamFirstBatch = async (batch: AudioBatch) => {
      const streamVoicePath = engine === 'chatterbox' ? voicePath || '' : voicePath
      if (engine === 'piper' && !streamVoicePath) {
        return { mode: 'fallback' as const, started: false }
      }

      const controller = new AbortController()
      streamAbortControllerRef.current = controller
      let pendingPcm = new Uint8Array(0)
      let scheduledAudio = false
      let sampleRate = engine === 'chatterbox' ? 24000 : 22050

      const flushPlayablePcm = (force = false) => {
        const playableLength = pendingPcm.byteLength - (pendingPcm.byteLength % 2)
        const minimumLength = scheduledAudio ? STREAM_STEADY_PCM_BYTES : STREAM_INITIAL_PCM_BYTES
        if (playableLength === 0) return
        if (!force && playableLength < minimumLength) return

        const pcmChunk = pendingPcm.slice(0, playableLength)
        pendingPcm = pendingPcm.slice(playableLength)

        const audioBuffer = createPcmAudioBuffer(ctx, pcmChunk, sampleRate)
        const { start } = scheduleAudioBuffer(
          ctx,
          audioBuffer,
          Math.min(fadeSec, STREAM_CHUNK_FADE_SEC),
          { playbackRate: 1 }
        )

        if (!scheduledAudio) {
          highlightScheduleRef.current.push({
            time: start + 0.04,
            globalIndex: batch.globalIndices[0]
          })
        }

        scheduledAudio = true
        markPlaybackStarted()
      }

      try {
        const response = await fetch(`${BACKEND_BASE_URL}/tts/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: batch.text,
            session_id: newSessionId,
            engine,
            speaker_wav: streamVoicePath || '',
            piper_model_path: engine === 'piper' ? streamVoicePath || '' : '',
            language: 'en',
            speed,
            quality_mode: xttsQuality
          }),
          signal: controller.signal
        })

        if (response.status === 499) {
          return { mode: 'cancelled' as const, started: scheduledAudio }
        }

        if (!response.ok) {
          if (!scheduledAudio) {
            return { mode: 'fallback' as const, started: false }
          }
          return { mode: 'partial' as const, started: true }
        }

        const sampleRateHeader = Number(response.headers.get('x-sample-rate'))
        if (Number.isFinite(sampleRateHeader) && sampleRateHeader > 0) {
          sampleRate = sampleRateHeader
        }

        const reader = response.body?.getReader()
        if (!reader) {
          return scheduledAudio
            ? { mode: 'partial' as const, started: true }
            : { mode: 'fallback' as const, started: false }
        }

        while (!stopSignalRef.current) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value || value.byteLength === 0) continue

          pendingPcm = concatUint8Arrays(pendingPcm, value)
          flushPlayablePcm(false)
        }

        if (stopSignalRef.current) {
          return { mode: 'cancelled' as const, started: scheduledAudio }
        }

        flushPlayablePcm(true)

        return scheduledAudio
          ? { mode: 'success' as const, started: true }
          : { mode: 'fallback' as const, started: false }
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          return { mode: 'cancelled' as const, started: scheduledAudio }
        }

        console.warn(`${engine.toUpperCase()} stream failed`, error)
        return scheduledAudio
          ? { mode: 'partial' as const, started: true }
          : { mode: 'fallback' as const, started: false }
      } finally {
        if (streamAbortControllerRef.current === controller) {
          streamAbortControllerRef.current = null
        }
      }
    }

    let nextGenerationIndex = shouldStreamFirstBatch ? 1 : 0
    if (shouldStreamFirstBatch) {
      bufferSize = getDesiredBufferSize(1, effectiveInitialBuffer)
    }
    const getContiguousReadySeconds = (startIndex: number) => {
      let total = 0

      for (let index = startIndex; index < batches.length; index++) {
        const batch = batches[index]

        if (batch.text === '[[[IMAGE]]]') {
          total += IMAGE_PAUSE_SEC
          continue
        }

        const readyBuffer = decodedBuffers[index]
        if (!readyBuffer) break

        total += readyBuffer.duration / playbackRate

        if (engine === 'chatterbox') {
          const nextBatch = index + 1 < batches.length ? batches[index + 1] : null
          total += getXttsJoinGapForBatch(batch, nextBatch)
        }
      }

      return total
    }

    const triggerUpTo = (targetExclusive: number) => {
      while (nextGenerationIndex < batches.length && nextGenerationIndex < targetExclusive) {
        triggerGeneration(nextGenerationIndex)
        nextGenerationIndex += 1
      }
    }

    let prefetchPromise: Promise<void> | null = null
    let desiredReadyStartIndex = shouldStreamFirstBatch ? 1 : 0
    let desiredReadySeconds = 0

    const ensureReadyAudio = (startIndex: number, targetSeconds: number) => {
      if (engine !== 'chatterbox' || !xttsBufferTargets) {
        return Promise.resolve()
      }

      desiredReadyStartIndex = Math.max(0, startIndex)
      desiredReadySeconds = Math.max(0, targetSeconds)

      if (prefetchPromise) {
        return prefetchPromise
      }

      prefetchPromise = (async () => {
        while (!isSessionStale()) {
          const readySeconds = getContiguousReadySeconds(desiredReadyStartIndex)
          updateBufferingUi(readySeconds, desiredReadySeconds)

          if (readySeconds >= desiredReadySeconds) {
            break
          }

          if (nextGenerationIndex < desiredReadyStartIndex) {
            nextGenerationIndex = desiredReadyStartIndex
          }

          if (nextGenerationIndex >= batches.length) {
            break
          }

          const generationIndex = nextGenerationIndex
          nextGenerationIndex += 1
          triggerGeneration(generationIndex)

          const promise = audioPromises[generationIndex]
          if (!promise) {
            continue
          }

          try {
            await promise
          } catch (error) {
            console.warn('Premium prefetch failed', error)
            break
          }
        }
      })().finally(() => {
        prefetchPromise = null
        if (
          !isSessionStale() &&
          engine === 'chatterbox' &&
          xttsBufferTargets &&
          getContiguousReadySeconds(desiredReadyStartIndex) < desiredReadySeconds &&
          nextGenerationIndex < batches.length
        ) {
          void ensureReadyAudio(desiredReadyStartIndex, desiredReadySeconds)
        }
      })

      return prefetchPromise
    }

    try {
      updateBufferingUi(0, engine === 'chatterbox' && xttsBufferTargets ? xttsBufferTargets.initialSeconds : 1)
      const firstBatchStreamPromise = shouldStreamFirstBatch ? streamFirstBatch(batches[0]) : null
      if (engine === 'chatterbox' && xttsBufferTargets) {
        const startupTargetIndex = shouldStreamFirstBatch
          ? 1
          : firstBatchCached && firstBatch?.text !== '[[[IMAGE]]]'
            ? 1
            : 0

        if (startupTargetIndex > 0 && batches.length > 0 && !audioPromises[0]) {
          triggerGeneration(0)
        }

        await ensureReadyAudio(startupTargetIndex, xttsBufferTargets.initialSeconds)

        if (startupTargetIndex > 0 && audioPromises[0]) {
          await audioPromises[0]
        }
      } else {
        triggerUpTo((shouldStreamFirstBatch ? 1 : 0) + bufferSize)

        if (!shouldStreamFirstBatch && batches.length > 0 && audioPromises[0]) {
          await audioPromises[0]
        }
      }

      for (let i = 0; i < batches.length; i++) {
        while (isPausedRef.current) {
          if (stopSignalRef.current) break
          await new Promise((r) => setTimeout(r, 200))
        }

        if (stopSignalRef.current) break

        const batch = batches[i]
        let result: AudioResult | null = null

        if (i === 0 && firstBatchStreamPromise) {
          const streamResult = await firstBatchStreamPromise
          if (streamResult.mode === 'cancelled' || stopSignalRef.current) break

          if (streamResult.mode !== 'fallback') {
            if (i === 0) {
              bufferSize = getDesiredBufferSize(i + 1, effectiveSteadyBuffer)
            }
            triggerUpTo(i + 1 + bufferSize)
            continue
          }
        }

        if (!audioPromises[i]) {
          triggerGeneration(i)
        }

        if (engine === 'chatterbox' && xttsBufferTargets) {
          void ensureReadyAudio(i + 1, xttsBufferTargets.steadySeconds)
        }

        try {
          result = await audioPromises[i]
        } catch (err) {
          console.warn('Generation failed', err)
          continue
        }

        if (stopSignalRef.current) break
        if (result?.status === 'cancelled') break
        if (engine === 'chatterbox' && xttsBufferTargets) {
          void ensureReadyAudio(i + 1, xttsBufferTargets.steadySeconds)
        } else {
          if (i === 0) {
            bufferSize = getDesiredBufferSize(i + 1, effectiveSteadyBuffer)
          }
          triggerUpTo(i + 1 + bufferSize)
        }

        if (result && result.status === 'skipped') {
          const idx = batch.globalIndices[0]

          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current)
          highlightScheduleRef.current.push({ time: startTime, globalIndex: idx })
          playbackEndTimeRef.current = startTime + IMAGE_PAUSE_SEC

          const imagePause = IMAGE_PAUSE_SEC
          nextStartTimeRef.current = startTime + imagePause

          const waitMs = (nextStartTimeRef.current - ctx.currentTime) * 1000
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        if (result && result.status === 'success' && result.audio_data) {
          try {
            let audioBuffer = decodedBuffers[i]
            if (!audioBuffer) {
              const cacheKey = buildCacheKey(batch.text, engine, voicePath, speed, xttsQuality)
              audioBuffer = await decodeToBuffer(cacheKey, result as CachedAudio)
              if (audioBuffer) decodedBuffers[i] = audioBuffer
            }
            if (!audioBuffer) continue

            const nextBatch = i + 1 < batches.length ? batches[i + 1] : null
            const joinGapSec =
              engine === 'chatterbox' ? getXttsJoinGapForBatch(batch, nextBatch) : 0

            const { start } = scheduleAudioBuffer(ctx, audioBuffer, bufferedFadeSec, {
              joinGapSec,
              playbackRate
            })
            markPlaybackStarted()

            const sentenceStartOffsets = estimateSentenceStartOffsets(
              batch.sentences,
              audioBuffer,
              playbackRate
            )
            sentenceStartOffsets.forEach((offset, idx) => {
              const triggerTime = start + offset + HIGHLIGHT_TRIGGER_DELAY_SEC
              highlightScheduleRef.current.push({
                time: triggerTime,
                globalIndex: batch.globalIndices[idx]
              })
            })

            const timeUntilNext = nextStartTimeRef.current - ctx.currentTime
            if (timeUntilNext > 4) {
              let waitTime = (timeUntilNext - 2) * 1000
              while (waitTime > 0 && !stopSignalRef.current) {
                if (isPausedRef.current) {
                  await new Promise((r) => setTimeout(r, 200))
                  continue
                }
                const chunk = Math.min(waitTime, 200)
                await new Promise((r) => setTimeout(r, chunk))
                waitTime -= chunk
              }
            }
          } catch (decodeErr) {
            console.error('Decode Error', decodeErr)
          }
        }
      }

      if (!stopSignalRef.current) {
        let remainingMs = Math.max(0, (playbackEndTimeRef.current - ctx.currentTime) * 1000)
        while (remainingMs > 0 && !stopSignalRef.current) {
          if (isPausedRef.current) {
            await new Promise((r) => setTimeout(r, 200))
            remainingMs = Math.max(0, (playbackEndTimeRef.current - ctx.currentTime) * 1000)
            continue
          }
          const chunk = Math.min(remainingMs, 200)
          await new Promise((r) => setTimeout(r, chunk))
          remainingMs = Math.max(0, (playbackEndTimeRef.current - ctx.currentTime) * 1000)
        }

        setStatus('Completed')
        setBuffering(EMPTY_BUFFER_STATE)
        setIsPlaying(false)
        setIsPaused(false)
        setGlobalSentenceIndex(-1)
        highlightedSentenceIndexRef.current = -1
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setBuffering(EMPTY_BUFFER_STATE)
      setIsPlaying(false)
      highlightedSentenceIndexRef.current = -1
    } finally {
      isPlayingRef.current = false
    }
  }

  useEffect(() => {
    let frameId = 0

    const updateHighlight = () => {
      frameId = window.requestAnimationFrame(updateHighlight)
      if (!isPlayingRef.current || isPausedRef.current || !audioCtxRef.current) {
        return
      }

      const t = audioCtxRef.current.currentTime
      const schedule = highlightScheduleRef.current
      let cursor = highlightCursorRef.current

      if (cursor >= schedule.length) return

      while (cursor < schedule.length && schedule[cursor].time <= t) {
        cursor += 1
      }

      if (cursor === highlightCursorRef.current) return

      highlightCursorRef.current = cursor
      const trigger = schedule[cursor - 1]
      if (highlightedSentenceIndexRef.current !== trigger.globalIndex) {
        highlightedSentenceIndexRef.current = trigger.globalIndex
        setGlobalSentenceIndex(trigger.globalIndex)
      }
    }

    frameId = window.requestAnimationFrame(updateHighlight)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    return () => {
      void stop()
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch((error) => {
          console.error(error)
        })
        audioCtxRef.current = null
      }
    }
  }, [])

  return { isPlaying, isPaused, globalSentenceIndex, status, buffering, play, pause, stop }
}
