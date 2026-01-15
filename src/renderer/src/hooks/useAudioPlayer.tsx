import { useState, useRef, useEffect } from 'react'
import { VisualBlock } from '../types/book'

// --- TYPES ---
interface AudioResult {
  status: string
  audio_data: Uint8Array | null
}

interface AudioPlayerProps {
  bookStructure: {
    allSentences: string[]
    sentenceToPageMap: number[]
    pagesStructure?: VisualBlock[][]
  }
  visualPageIndex: number
}

interface AudioBatch {
  text: string
  sentences: string[]
  globalIndices: number[]
}

interface HighlightTrigger {
  time: number
  globalIndex: number
}

interface CachedAudio {
  status: string
  audio_data: Uint8Array | null
}

// --- CONSTANTS ---
const DEFAULT_BATCH_RAMP = [10, 14, 20]
const DEFAULT_BATCH_SIZE_STANDARD = 40
const DEFAULT_MAX_TTS_CHARS = 200
const DEFAULT_INITIAL_BUFFER = 3
const DEFAULT_STEADY_BUFFER = 8
const DEFAULT_CROSSFADE_SEC = 0.03
const MAX_CROSSFADE_SEC = 0.12
const LOW_END_BATCH_RAMP = [6, 10, 14]
const LOW_END_BATCH_SIZE_STANDARD = 24
const LOW_END_MAX_TTS_CHARS = 140
const LOW_END_INITIAL_BUFFER = 2
const LOW_END_STEADY_BUFFER = 5
const AUDIO_CACHE_LIMIT = 80
const AUDIO_CACHE_DB = 'nur-audio-cache'
const AUDIO_CACHE_STORE = 'audio'
const AUDIO_CACHE_DISK_LIMIT = 120
const ENABLE_PREWARM = false

// --- HELPER: Time Estimator ---
const estimateSentenceDurations = (sentences: string[], totalDuration: number) => {
  const basePerSentence = 0.12
  const weights = sentences.map((s) => {
    const wordCount = Math.max(1, s.trim().split(/\s+/).length)
    const punctuationBoost = (s.match(/[.!?]/g) || []).length * 0.6
    const commaBoost = (s.match(/[,;:]/g) || []).length * 0.25
    return wordCount + punctuationBoost + commaBoost
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const baseTotal = basePerSentence * sentences.length
  const remaining = Math.max(0.1, totalDuration - baseTotal)

  return weights.map((weight) => basePerSentence + (weight / totalWeight) * remaining)
}

const openAudioCache = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(AUDIO_CACHE_DB, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
        const store = db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: 'key' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const getCachedAudioFromDisk = async (db: IDBDatabase, key: string) =>
  new Promise<CachedAudio | null>((resolve) => {
    const tx = db.transaction(AUDIO_CACHE_STORE, 'readonly')
    const store = tx.objectStore(AUDIO_CACHE_STORE)
    const req = store.get(key)
    req.onsuccess = () => {
      const result = req.result
      if (result?.data) {
        resolve({ status: 'success', audio_data: new Uint8Array(result.data) })
      } else {
        resolve(null)
      }
    }
    req.onerror = () => resolve(null)
  })

const setCachedAudioOnDisk = async (db: IDBDatabase, key: string, data: Uint8Array) =>
  new Promise<void>((resolve) => {
    const tx = db.transaction(AUDIO_CACHE_STORE, 'readwrite')
    const store = tx.objectStore(AUDIO_CACHE_STORE)
    store.put({ key, data: data.buffer, updatedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })

const pruneDiskCache = async (db: IDBDatabase) =>
  new Promise<void>((resolve) => {
    const tx = db.transaction(AUDIO_CACHE_STORE, 'readwrite')
    const store = tx.objectStore(AUDIO_CACHE_STORE)
    const index = store.index('updatedAt')
    const keysToDelete: IDBValidKey[] = []
    let count = 0

    index.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
      if (!cursor) {
        const excess = Math.max(0, count - AUDIO_CACHE_DISK_LIMIT)
        const toRemove = keysToDelete.slice(0, excess)
        toRemove.forEach((key) => store.delete(key))
        resolve()
        return
      }
      count += 1
      keysToDelete.push(cursor.primaryKey)
      cursor.continue()
    }
  })

export function useAudioPlayer({
  bookStructure,
  visualPageIndex
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const isPausedRef = useRef(false)
  const stopSignalRef = useRef(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const highlightScheduleRef = useRef<HighlightTrigger[]>([])

  // Session Tracking
  const currentSessionId = useRef<string>('')
  const audioCacheRef = useRef<Map<string, CachedAudio>>(new Map())
  const audioCacheKeysRef = useRef<string[]>([])
  const audioCacheDbRef = useRef<IDBDatabase | null>(null)
  const prewarmTimeoutRef = useRef<number | null>(null)

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }

  const decodeToBuffer = async (result: CachedAudio): Promise<AudioBuffer | null> => {
    const ctx = audioCtxRef.current
    if (!ctx || !result.audio_data) return null
    try {
      const rawData = result.audio_data
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer
      return await ctx.decodeAudioData(cleanBuffer)
    } catch (err) {
      console.error('Decode Error', err)
      return null
    }
  }

  const buildCacheKey = (text: string, engine: string, voicePath: string | null, speed: number) =>
    `${engine}:${voicePath || 'default'}:${speed}:${text}`

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

  const buildBatches = (
    startPageIndex: number,
    batchRamp: number[],
    batchSizeStandard: number,
    maxTtsChars: number
  ) => {
    const batches: AudioBatch[] = []
    const orderedIndices: number[] = []
    const pages = bookStructure.pagesStructure

    if (pages && pages[startPageIndex]) {
      for (let pageIdx = startPageIndex; pageIdx < pages.length; pageIdx++) {
        const blocks = pages[pageIdx] || []
        for (const block of blocks) {
          if (block.type === 'image') {
            orderedIndices.push(block.startIndex)
          } else {
            for (let i = 0; i < block.content.length; i++) {
              orderedIndices.push(block.startIndex + i)
            }
          }
        }
      }
    }

    const safeStartIndex =
      orderedIndices.length > 0
        ? orderedIndices[0]
        : bookStructure.sentenceToPageMap.findIndex((p) => p === startPageIndex)

    const activeIndices =
      orderedIndices.length > 0
        ? orderedIndices
        : bookStructure.allSentences.map((_, idx) => idx).slice(Math.max(0, safeStartIndex))

    const activeSentences = activeIndices.map((idx) => bookStructure.allSentences[idx])
    const getGlobalIndex = (localIndex: number) => activeIndices[localIndex]

    let currentBatchText: string[] = []
    let currentBatchIndices: number[] = []
    let currentWordCount = 0
    let currentCharCount = 0
    let batchIndex = 0

    for (let i = 0; i < activeSentences.length; i++) {
      const text = activeSentences[i]
      const globalIdx = getGlobalIndex(i)

      if (text.includes('[[[IMG_MARKER')) {
        if (currentBatchText.length > 0) {
          batches.push({
            text: currentBatchText.join(' '),
            sentences: [...currentBatchText],
            globalIndices: [...currentBatchIndices]
          })
          currentBatchText = []
          currentBatchIndices = []
          currentWordCount = 0
          currentCharCount = 0
          batchIndex++
        }
        batches.push({ text: '[[[IMAGE]]]', sentences: [text], globalIndices: [globalIdx] })
        continue
      }

      const wordCount = text.split(/\s+/).length
      const nextCharCount = currentCharCount + (currentCharCount > 0 ? 1 : 0) + text.length
      currentBatchText.push(text)
      currentBatchIndices.push(globalIdx)
      currentWordCount += wordCount

      const targetSize =
        batchIndex < batchRamp.length ? batchRamp[batchIndex] : batchSizeStandard

      if (currentWordCount >= targetSize || nextCharCount > maxTtsChars) {
        batches.push({
          text: currentBatchText.join(' '),
          sentences: [...currentBatchText],
          globalIndices: [...currentBatchIndices]
        })
        currentBatchText = []
        currentBatchIndices = []
        currentWordCount = 0
        currentCharCount = 0
        batchIndex++
      }
      currentCharCount = nextCharCount
    }
    if (currentBatchText.length > 0) {
      batches.push({
        text: currentBatchText.join(' '),
        sentences: [...currentBatchText],
        globalIndices: [...currentBatchIndices]
      })
    }

    return batches
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
      const batchRamp = lowEndMode ? LOW_END_BATCH_RAMP : DEFAULT_BATCH_RAMP
      const batchSizeStandard = lowEndMode ? LOW_END_BATCH_SIZE_STANDARD : DEFAULT_BATCH_SIZE_STANDARD
      const maxTtsChars = lowEndMode ? LOW_END_MAX_TTS_CHARS : DEFAULT_MAX_TTS_CHARS

      const batches = buildBatches(visualPageIndex, batchRamp, batchSizeStandard, maxTtsChars)
      const firstBatch = batches[0]
      if (!firstBatch || firstBatch.text === '[[[IMAGE]]]' || !firstBatch.text.trim()) return

      const engine = localStorage.getItem('tts_engine') || 'xtts'
      const voicePath =
        engine === 'piper'
          ? localStorage.getItem('piper_model_path')
          : localStorage.getItem('custom_voice_path')
      const speed = 1.2
      const cacheKey = buildCacheKey(firstBatch.text, engine, voicePath, speed)
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
        voicePath: voicePath
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
    setGlobalSentenceIndex(-1)

    highlightScheduleRef.current = []

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
        audioCtxRef.current = null
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
    setGlobalSentenceIndex(-1)

    initAudioContext()

    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    const newSessionId = Date.now().toString()
    currentSessionId.current = newSessionId
    await window.api.setSession(newSessionId)

    const lowEndMode = localStorage.getItem('low_end_mode') === 'true'
    const batchRamp = lowEndMode ? LOW_END_BATCH_RAMP : DEFAULT_BATCH_RAMP
    const batchSizeStandard = lowEndMode ? LOW_END_BATCH_SIZE_STANDARD : DEFAULT_BATCH_SIZE_STANDARD
    const maxTtsChars = lowEndMode ? LOW_END_MAX_TTS_CHARS : DEFAULT_MAX_TTS_CHARS
    const initialDefault = lowEndMode ? LOW_END_INITIAL_BUFFER : DEFAULT_INITIAL_BUFFER
    const steadyDefault = lowEndMode ? LOW_END_STEADY_BUFFER : DEFAULT_STEADY_BUFFER
    const storedInitial = Number(localStorage.getItem('audio_buffer_initial'))
    const storedSteady = Number(localStorage.getItem('audio_buffer_steady'))
    const storedCrossfadeMs = Number(localStorage.getItem('audio_crossfade_ms'))
    const initialBuffer =
      Number.isFinite(storedInitial) && storedInitial > 0 ? storedInitial : initialDefault
    const steadyBuffer =
      Number.isFinite(storedSteady) && storedSteady > 0 ? storedSteady : steadyDefault
    const fadeSec = Number.isFinite(storedCrossfadeMs)
      ? Math.min(MAX_CROSSFADE_SEC, Math.max(0, storedCrossfadeMs / 1000))
      : DEFAULT_CROSSFADE_SEC

    const batches = buildBatches(visualPageIndex, batchRamp, batchSizeStandard, maxTtsChars)

    const audioPromises: Promise<AudioResult>[] = new Array(batches.length).fill(null)
    const decodedBuffers: Array<AudioBuffer | null> = new Array(batches.length).fill(null)
    let bufferSize = initialBuffer

    const triggerGeneration = (index: number) => {
      if (index >= batches.length) return
      const batch = batches[index]

      if (batch.text === '[[[IMAGE]]]' ) {
        audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
      } else {
        const engine = localStorage.getItem('tts_engine') || 'xtts'
        const voicePath =
          engine === 'piper'
            ? localStorage.getItem('piper_model_path')
            : localStorage.getItem('custom_voice_path')
        const speed = 1.2
        const cacheKey = buildCacheKey(batch.text, engine, voicePath, speed)
        const cached = audioCacheRef.current.get(cacheKey)

        const resolveAndMaybeDecode = async () => {
          const db = audioCacheDbRef.current
          if (db) {
            const diskHit = await getCachedAudioFromDisk(db, cacheKey)
            if (diskHit) {
              setCache(cacheKey, diskHit)
              const decoded = await decodeToBuffer(diskHit)
              decodedBuffers[index] = decoded
              return diskHit
            }
          }

          const result = await window.api.generate(batch.text, speed, newSessionId, {
            engine: engine,
            voicePath: voicePath
          })

          if (result?.status === 'success' && result.audio_data) {
            setCache(cacheKey, result as CachedAudio)
            if (db) {
              await setCachedAudioOnDisk(db, cacheKey, result.audio_data)
              await pruneDiskCache(db)
            }
            const decoded = await decodeToBuffer(result as CachedAudio)
            decodedBuffers[index] = decoded
          }
          return result
        }

        if (cached) {
          audioPromises[index] = Promise.resolve(cached).then(async (result) => {
            const decoded = await decodeToBuffer(result as CachedAudio)
            decodedBuffers[index] = decoded
            return result
          })
        } else {
          audioPromises[index] = resolveAndMaybeDecode()
        }
      }
    }

    try {
      setStatus('Buffering...')
      const initialFetch = Math.min(batches.length, bufferSize)
      for (let i = 0; i < initialFetch; i++) triggerGeneration(i)

      if (batches.length > 0) await audioPromises[0]

      for (let i = 0; i < batches.length; i++) {
        while (isPausedRef.current) {
          if (stopSignalRef.current) break
          await new Promise((r) => setTimeout(r, 200))
        }

        if (stopSignalRef.current) break

        const batch = batches[i]
        setStatus(`Reading segment ${i + 1}...`)

        if (!audioPromises[i]) {
          triggerGeneration(i)
        }

        let result: AudioResult | null = null
        try {
          result = await audioPromises[i]
        } catch (err) {
          console.warn('Generation failed', err)
          continue
        }

        if (stopSignalRef.current) break
        if (i === 0) bufferSize = steadyBuffer
        triggerGeneration(i + bufferSize)

        if (result && result.status === 'skipped') {
          const idx = batch.globalIndices[0]

          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current)
          highlightScheduleRef.current.push({ time: startTime, globalIndex: idx })

          const imagePause = 2.0
          nextStartTimeRef.current = startTime + imagePause

          const waitMs = (nextStartTimeRef.current - ctx.currentTime) * 1000
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        if (result && result.status === 'success' && result.audio_data) {
          try {
            let audioBuffer = decodedBuffers[i]
            if (!audioBuffer) {
              audioBuffer = await decodeToBuffer(result as CachedAudio)
              if (audioBuffer) decodedBuffers[i] = audioBuffer
            }
            if (!audioBuffer) continue

            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
            const gainNode = ctx.createGain()
            gainNode.gain.setValueAtTime(0, start)
            gainNode.gain.linearRampToValueAtTime(1, start + fadeSec)
            const endTime = start + audioBuffer.duration
            gainNode.gain.setValueAtTime(1, Math.max(start, endTime - fadeSec))
            gainNode.gain.linearRampToValueAtTime(0, endTime)
            source.connect(gainNode)
            gainNode.connect(ctx.destination)

            source.start(start)
            const overlap = Math.min(fadeSec, audioBuffer.duration * 0.25)
            nextStartTimeRef.current = Math.max(start + 0.02, start + audioBuffer.duration - overlap)

            const durations = estimateSentenceDurations(batch.sentences, audioBuffer.duration)
            let accumulatedTime = 0
            durations.forEach((dur, idx) => {
              const triggerTime = start + accumulatedTime + 0.08
              highlightScheduleRef.current.push({
                time: triggerTime,
                globalIndex: batch.globalIndices[idx]
              })
              accumulatedTime += dur
            })

            highlightScheduleRef.current.sort((a, b) => a.time - b.time)

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
        setStatus('Completed')
        setIsPlaying(false)
        setIsPaused(false)
        setGlobalSentenceIndex(-1)
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
    } finally {
      isPlayingRef.current = false
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlayingRef.current || isPausedRef.current || !audioCtxRef.current) return

      const t = audioCtxRef.current.currentTime
      const schedule = highlightScheduleRef.current

      if (schedule.length === 0) return

      let lastPassedIndex = -1
      for (let i = 0; i < schedule.length; i++) {
        if (schedule[i].time <= t + 0.05) {
          lastPassedIndex = i
        } else {
          break
        }
      }

      if (lastPassedIndex !== -1) {
        const trigger = schedule[lastPassedIndex]
        setGlobalSentenceIndex((prev) => {
          if (prev !== trigger.globalIndex) {
            return trigger.globalIndex
          }
          return prev
        })
        highlightScheduleRef.current = schedule.slice(lastPassedIndex + 1)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [bookStructure])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop }
}
