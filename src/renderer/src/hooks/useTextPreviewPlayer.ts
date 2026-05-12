import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationTargetLanguage } from '../../../shared/translation'
import { getStoredTtsEngine } from '../utils/tts'
import { getStoredTtsSpeed, getStoredXttsQualityMode } from './audioPlayer/config'
import { estimateSentenceStartOffsets } from './audioPlayer/batching'
import { splitTextIntoSentences } from '../utils/pageTranslation'

interface UseTextPreviewPlayerOptions {
  onBeforePlay?: () => Promise<void> | void
}

interface UseTextPreviewPlayerResult {
  isGenerating: boolean
  isPlaying: boolean
  activeSentenceIndex: number | null
  error: string | null
  playText: (
    text: string,
    targetLanguage?: TranslationTargetLanguage,
    sentences?: string[]
  ) => Promise<boolean>
  stop: () => Promise<void>
  clearError: () => void
}

const HIGHLIGHT_TRIGGER_DELAY_SEC = 0.03

const toUint8Array = (value: Uint8Array | ArrayBuffer | number[]): Uint8Array => {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value)
}

export function useTextPreviewPlayer({
  onBeforePlay
}: UseTextPreviewPlayerOptions = {}): UseTextPreviewPlayerResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const sessionIdRef = useRef('')
  const highlightFrameRef = useRef<number | null>(null)
  const highlightScheduleRef = useRef<Array<{ time: number; index: number }>>([])
  const highlightCursorRef = useRef(0)
  const playbackStartTimeRef = useRef(0)

  const getAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      if (!AudioContextCtor) {
        throw new Error('Audio playback is not supported in this environment.')
      }

      audioContextRef.current = new AudioContextCtor()
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }, [])

  const stopHighlightLoop = useCallback((): void => {
    if (highlightFrameRef.current !== null) {
      window.cancelAnimationFrame(highlightFrameRef.current)
      highlightFrameRef.current = null
    }
    highlightScheduleRef.current = []
    highlightCursorRef.current = 0
    playbackStartTimeRef.current = 0
    setActiveSentenceIndex(null)
  }, [])

  const runHighlightLoop = useCallback((audioContext: AudioContext): void => {
    if (highlightFrameRef.current !== null) {
      window.cancelAnimationFrame(highlightFrameRef.current)
    }

    const tick = (): void => {
      const schedule = highlightScheduleRef.current
      if (!schedule.length || !sourceRef.current) {
        highlightFrameRef.current = null
        return
      }

      const elapsed =
        audioContext.currentTime - playbackStartTimeRef.current + HIGHLIGHT_TRIGGER_DELAY_SEC
      let cursor = highlightCursorRef.current

      while (cursor < schedule.length && schedule[cursor].time <= elapsed) {
        cursor += 1
      }

      if (cursor !== highlightCursorRef.current) {
        highlightCursorRef.current = cursor
        const trigger = schedule[Math.max(0, cursor - 1)]
        setActiveSentenceIndex(trigger.index)
      }

      highlightFrameRef.current = window.requestAnimationFrame(tick)
    }

    highlightFrameRef.current = window.requestAnimationFrame(tick)
  }, [])

  const clearSource = useCallback((stopPlayback = false): void => {
    if (!sourceRef.current) return

    sourceRef.current.onended = null

    if (stopPlayback) {
      try {
        sourceRef.current.stop()
      } catch (stopError) {
        console.warn('Failed to stop translated preview source', stopError)
      }
    }

    try {
      sourceRef.current.disconnect()
    } catch (disconnectError) {
      console.warn('Failed to disconnect translated preview source', disconnectError)
    }

    sourceRef.current = null
  }, [])

  const resetSession = useCallback(async () => {
    if (!sessionIdRef.current) return
    sessionIdRef.current = ''
    try {
      await window.api.setSession('')
    } catch (sessionError) {
      console.warn('Failed to clear preview TTS session', sessionError)
    }
  }, [])

  const stop = useCallback(async () => {
    clearSource(true)
    stopHighlightLoop()
    setIsPlaying(false)
    setIsGenerating(false)

    if (audioContextRef.current?.state === 'running') {
      try {
        await audioContextRef.current.suspend()
      } catch (suspendError) {
        console.warn('Failed to suspend translated preview audio context', suspendError)
      }
    }

    await resetSession()
  }, [clearSource, resetSession, stopHighlightLoop])

  const playText = useCallback(
    async (text: string, targetLanguage?: TranslationTargetLanguage, sentences?: string[]) => {
      const cleanText = text.trim()
      if (!cleanText) {
        setError('There is no translated text to play yet.')
        return false
      }

      await onBeforePlay?.()
      await stop()

      try {
        setError(null)
        setIsGenerating(true)
        stopHighlightLoop()

        const sessionId = `translation-preview-${Date.now()}`
        sessionIdRef.current = sessionId
        await window.api.setSession(sessionId)

        const engine = targetLanguage ? 'piper' : getStoredTtsEngine()
        const voicePath =
          engine === 'piper'
            ? localStorage.getItem('piper_model_path')
            : localStorage.getItem('custom_voice_path')

        const result = await window.api.generate(cleanText, getStoredTtsSpeed(), sessionId, {
          engine,
          voicePath,
          quality_mode: getStoredXttsQualityMode(),
          language: targetLanguage
        })

        if (result?.status !== 'success' || !result.audio_data) {
          throw new Error(
            result?.status === 'cancelled'
              ? 'Translated speech generation was cancelled.'
              : 'Could not generate speech for the translated page.'
          )
        }

        const audioContext = await getAudioContext()
        const audioBytes = toUint8Array(result.audio_data)
        const audioBuffer = audioBytes.buffer.slice(
          audioBytes.byteOffset,
          audioBytes.byteOffset + audioBytes.byteLength
        ) as ArrayBuffer
        const decodedBuffer = await audioContext.decodeAudioData(audioBuffer)
        const highlightSentences =
          sentences?.map((sentence) => sentence.trim()).filter(Boolean) ??
          splitTextIntoSentences(cleanText, targetLanguage || 'en')
        const sentenceOffsets =
          highlightSentences.length > 0
            ? estimateSentenceStartOffsets(highlightSentences, decodedBuffer, 1)
            : []

        const source = audioContext.createBufferSource()
        source.buffer = decodedBuffer
        source.connect(audioContext.destination)
        sourceRef.current = source

        source.onended = () => {
          if (sourceRef.current !== source) return
          clearSource()
          stopHighlightLoop()
          setIsPlaying(false)
          setIsGenerating(false)
          void resetSession()
        }

        highlightScheduleRef.current = sentenceOffsets.map((time, index) => ({ time, index }))
        highlightCursorRef.current = 0
        playbackStartTimeRef.current = audioContext.currentTime
        source.start(playbackStartTimeRef.current)
        if (highlightScheduleRef.current.length > 0) {
          setActiveSentenceIndex(0)
          runHighlightLoop(audioContext)
        }
        setIsPlaying(true)
        setIsGenerating(false)
        return true
      } catch (playbackError) {
        clearSource(true)
        stopHighlightLoop()
        setIsPlaying(false)
        setIsGenerating(false)
        setError(playbackError instanceof Error ? playbackError.message : 'Playback failed.')
        await resetSession()
        return false
      }
    },
    [
      clearSource,
      getAudioContext,
      onBeforePlay,
      resetSession,
      runHighlightLoop,
      stop,
      stopHighlightLoop
    ]
  )

  useEffect(() => {
    return () => {
      void (async () => {
        await stop()

        if (audioContextRef.current) {
          try {
            await audioContextRef.current.close()
          } catch (closeError) {
            console.warn('Failed to close translated preview audio context', closeError)
          }
          audioContextRef.current = null
        }
      })()
    }
  }, [stop])

  const clearError = useCallback(() => setError(null), [])

  return {
    isGenerating,
    isPlaying,
    activeSentenceIndex,
    error,
    playText,
    stop,
    clearError
  }
}
