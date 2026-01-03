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
    pagesStructure: VisualBlock[][]
  }
  visualPageIndex: number
  setVisualPageIndex: React.Dispatch<React.SetStateAction<number>>
}

interface AudioBatch {
  text: string
  startSentenceIndex: number
  sentenceCount: number
  sentences: string[]
}

// --- CONSTANTS ---
const TARGET_WORDS_PER_BATCH = 40
const CHUNK_SPACING = 0.1 // 100ms breath between batches
const SILENCE_THRESHOLD = 0.005

// --- HELPER: Trim Silence ---
const trimSilence = (ctx: AudioContext, buffer: AudioBuffer): AudioBuffer => {
  const rawData = buffer.getChannelData(0)
  const len = rawData.length

  let start = 0
  while (start < len && Math.abs(rawData[start]) < SILENCE_THRESHOLD) {
    start++
  }

  let end = len - 1
  while (end > start && Math.abs(rawData[end]) < SILENCE_THRESHOLD) {
    end--
  }

  if (start >= end) return buffer

  const trimmedLength = end - start + 1
  const trimmedBuffer = ctx.createBuffer(buffer.numberOfChannels, trimmedLength, buffer.sampleRate)

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i).subarray(start, end + 1)
    trimmedBuffer.copyToChannel(channelData, i)
  }

  return trimmedBuffer
}

// --- HELPER: IMPROVED Estimator (Weighted Characters) ---
const estimateSentenceDurations = (sentences: string[], totalDuration: number) => {
  const weights = sentences.map((s) => {
    const charCount = s.length
    // Heuristic: A punctuation mark is worth ~6 characters of "time" (pause)
    const punctuationCount = (s.match(/[,.;:!?—]/g) || []).length
    return charCount + punctuationCount * 6
  })

  const totalWeight = weights.reduce((a, b) => a + b, 0)

  // Safety check to avoid division by zero
  if (totalWeight === 0) return sentences.map(() => totalDuration / sentences.length)

  return weights.map((w) => (w / totalWeight) * totalDuration)
}

export function useAudioPlayer({
  bookStructure,
  visualPageIndex,
  setVisualPageIndex
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const playbackTimeoutsRef = useRef<NodeJS.Timeout[]>([])

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }

  const stop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')

    // Reset timing
    nextStartTimeRef.current = 0

    // Clear all pending highlights
    playbackTimeoutsRef.current.forEach((id) => clearTimeout(id))
    playbackTimeoutsRef.current = []

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
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)
    initAudioContext()

    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    // 1. CREATE BATCHES
    const batches: AudioBatch[] = []
    let currentBatchSentences: string[] = []
    let currentBatchWordCount = 0
    let batchStartIndex = -1

    let startingGlobalIndex = 0
    // Simple lookup to resume from current page
    if (visualPageIndex > 0) {
      const match = bookStructure.sentenceToPageMap.findIndex((p) => p === visualPageIndex)
      if (match !== -1) startingGlobalIndex = match
    }

    for (let i = startingGlobalIndex; i < bookStructure.allSentences.length; i++) {
      const sentence = bookStructure.allSentences[i]

      // Handle Image Markers
      if (sentence.includes('[[[IMG_MARKER')) {
        if (currentBatchSentences.length > 0) {
          batches.push({
            text: currentBatchSentences.join(' '),
            startSentenceIndex: batchStartIndex,
            sentenceCount: currentBatchSentences.length,
            sentences: [...currentBatchSentences]
          })
          currentBatchSentences = []
          currentBatchWordCount = 0
        }
        batches.push({
          text: '[[[IMAGE]]]',
          startSentenceIndex: i,
          sentenceCount: 1,
          sentences: [sentence]
        })
        continue
      }

      // Standard Text
      const words = sentence.trim().split(/\s+/).length

      if (currentBatchSentences.length === 0) {
        batchStartIndex = i
      }

      currentBatchSentences.push(sentence)
      currentBatchWordCount += words

      if (currentBatchWordCount >= TARGET_WORDS_PER_BATCH) {
        batches.push({
          text: currentBatchSentences.join(' '),
          startSentenceIndex: batchStartIndex,
          sentenceCount: currentBatchSentences.length,
          sentences: [...currentBatchSentences]
        })
        currentBatchSentences = []
        currentBatchWordCount = 0
      }
    }

    // Add final batch
    if (currentBatchSentences.length > 0) {
      batches.push({
        text: currentBatchSentences.join(' '),
        startSentenceIndex: batchStartIndex,
        sentenceCount: currentBatchSentences.length,
        sentences: [...currentBatchSentences]
      })
    }

    // 2. PREPARE PIPELINE
    const BUFFER_SIZE = 3
    const audioPromises: Promise<AudioResult>[] = new Array(batches.length).fill(null)

    const triggerGeneration = (index: number) => {
      if (index >= batches.length) return
      const batch = batches[index]

      if (batch.text === '[[[IMAGE]]]') {
        audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
      } else {
        // Generate audio (adjust speed here if needed, e.g., 1.0 or 1.2)
        audioPromises[index] = window.api.generate(batch.text, 1.2)
      }
    }

    try {
      setStatus('Buffering...')
      const initialBatch = Math.min(batches.length, BUFFER_SIZE)
      for (let i = 0; i < initialBatch; i++) triggerGeneration(i)

      // 3. PLAYBACK LOOP
      for (let i = 0; i < batches.length; i++) {
        if (stopSignalRef.current) break

        const batch = batches[i]
        setStatus(`Reading segment ${i + 1}...`)

        let result: AudioResult | null = null
        try {
          result = await audioPromises[i]
        } catch (err) {
          console.error(err)
          continue
        }

        if (stopSignalRef.current) break
        triggerGeneration(i + BUFFER_SIZE)

        // --- IMAGE HANDLING ---
        if (batch.text === '[[[IMAGE]]]') {
          setGlobalSentenceIndex(batch.startSentenceIndex)
          const pIndex = bookStructure.sentenceToPageMap[batch.startSentenceIndex]
          if (pIndex !== undefined) setVisualPageIndex((curr) => (curr !== pIndex ? pIndex : curr))

          const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
          nextStartTimeRef.current = start + 2.0 // Pause 2s for image
          const wait = (start - ctx.currentTime) * 1000
          if (wait > 0) await new Promise((r) => setTimeout(r, wait))
          continue
        }

        // --- AUDIO HANDLING ---
        if (result && result.status === 'success' && result.audio_data) {
          try {
            const rawData = result.audio_data
            const cleanBuffer = rawData.buffer.slice(
              rawData.byteOffset,
              rawData.byteOffset + rawData.byteLength
            ) as ArrayBuffer

            const tempBuffer = await ctx.decodeAudioData(cleanBuffer)

            // Step A: Trim Silence (Fixes robotic pauses)
            const audioBuffer = trimSilence(ctx, tempBuffer)

            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)

            const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current)
            source.start(startTime)

            // Step B: Schedule Next Chunk
            nextStartTimeRef.current = startTime + audioBuffer.duration + CHUNK_SPACING

            // Step C: Highlight Sync (Improved)
            const durations = estimateSentenceDurations(batch.sentences, audioBuffer.duration)

            let accumulatedTime = 0
            durations.forEach((duration, idx) => {
              const sentenceGlobalIndex = batch.startSentenceIndex + idx
              const triggerTime = startTime + accumulatedTime

              // Add a tiny +50ms offset to ensure audio has actually started to avoid "rushing" sensation
              const delayMs = (triggerTime - ctx.currentTime) * 1000 + 50

              if (delayMs >= 0) {
                const timeoutId = setTimeout(() => {
                  if (!stopSignalRef.current) {
                    setGlobalSentenceIndex(sentenceGlobalIndex)
                    // Auto-turn page
                    const pIndex = bookStructure.sentenceToPageMap[sentenceGlobalIndex]
                    setVisualPageIndex((curr) => (curr !== pIndex ? pIndex : curr))
                  }
                }, delayMs)
                playbackTimeoutsRef.current.push(timeoutId)
              }
              accumulatedTime += duration
            })

            // Loop Optimization
            const timeUntilNext = nextStartTimeRef.current - ctx.currentTime
            if (timeUntilNext > 4) {
              await new Promise((r) => setTimeout(r, (timeUntilNext - 2) * 1000))
            }
          } catch (err) {
            console.error('Decode error', err)
          }
        }
      }

      if (!stopSignalRef.current) {
        setStatus('Completed')
        setIsPlaying(false)
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
    }
  }

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { isPlaying, globalSentenceIndex, status, play, stop }
}
