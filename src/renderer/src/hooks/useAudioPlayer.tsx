import { useState, useRef, useEffect } from 'react'

// --- TYPES ---
interface AudioResult {
  status: string
  audio_data: Uint8Array | null
}

interface AudioPlayerProps {
  bookStructure: {
    allSentences: string[]
    sentenceToPageMap: number[]
  }
  visualPageIndex: number
  setVisualPageIndex: React.Dispatch<React.SetStateAction<number>>
}

interface AudioBatch {
  text: string
  sentences: string[]
  globalIndices: number[]
}

// --- CONSTANTS ---
// We use a "Ramp-up" strategy.
// Start small for speed, then get bigger for flow.
const BATCH_SIZE_START = 15 // Very fast first chunk
const BATCH_SIZE_STANDARD = 35 // Reduced from 40 to avoid 250 char warning

// --- HELPER: Time Estimator ---
const estimateSentenceDurations = (sentences: string[], totalDuration: number) => {
  const wordCounts = sentences.map((s) => Math.max(1, s.trim().split(/\s+/).length))
  const totalWords = wordCounts.reduce((a, b) => a + b, 0)
  return wordCounts.map((count) => (count / totalWords) * totalDuration)
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

    // --- 1. BUILD BATCHES (RAMP-UP STRATEGY) ---
    const batches: AudioBatch[] = []

    const startSentenceIndex = bookStructure.sentenceToPageMap.findIndex(
      (p) => p === visualPageIndex
    )
    const safeStartIndex = startSentenceIndex >= 0 ? startSentenceIndex : 0
    const activeSentences = bookStructure.allSentences.slice(safeStartIndex)
    const getGlobalIndex = (localIndex: number) => safeStartIndex + localIndex

    let currentBatchText: string[] = []
    let currentBatchIndices: number[] = []
    let currentWordCount = 0
    let batchIndex = 0 // Track which batch we are on

    for (let i = 0; i < activeSentences.length; i++) {
      const text = activeSentences[i]
      const globalIdx = getGlobalIndex(i)

      // Images break the flow
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
          batchIndex++
        }
        batches.push({
          text: '[[[IMAGE]]]',
          sentences: [text],
          globalIndices: [globalIdx]
        })
        // Do not increment batchIndex for images, or do - doesn't matter much.
        continue
      }

      const wordCount = text.split(/\s+/).length

      currentBatchText.push(text)
      currentBatchIndices.push(globalIdx)
      currentWordCount += wordCount

      // DYNAMIC TARGET SIZE
      // Batch 0: ~15 words (Fast start)
      // Batch 1+: ~35 words (Smooth flow, prevents timeouts)
      const targetSize = batchIndex === 0 ? BATCH_SIZE_START : BATCH_SIZE_STANDARD

      if (currentWordCount >= targetSize) {
        batches.push({
          text: currentBatchText.join(' '),
          sentences: [...currentBatchText],
          globalIndices: [...currentBatchIndices]
        })
        currentBatchText = []
        currentBatchIndices = []
        currentWordCount = 0
        batchIndex++
      }
    }
    // Push leftovers
    if (currentBatchText.length > 0) {
      batches.push({
        text: currentBatchText.join(' '),
        sentences: [...currentBatchText],
        globalIndices: [...currentBatchIndices]
      })
    }

    // --- 2. PIPELINE SETUP ---
    const audioPromises: Promise<AudioResult>[] = new Array(batches.length).fill(null)
    const BUFFER_SIZE = 3

    const triggerGeneration = (index: number) => {
      if (index >= batches.length) return
      const batch = batches[index]

      if (batch.text === '[[[IMAGE]]]') {
        audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
      } else {
        audioPromises[index] = window.api.generate(batch.text, 1.2)
      }
    }

    try {
      setStatus('Buffering...')

      // Start the pipeline
      const initialFetch = Math.min(batches.length, BUFFER_SIZE)
      for (let i = 0; i < initialFetch; i++) triggerGeneration(i)

      // Wait for the FIRST batch only before playing.
      // Since Batch 0 is small, this should be fast (~2-3s).
      if (batches.length > 0) await audioPromises[0]

      // --- 3. PLAYBACK LOOP ---
      for (let i = 0; i < batches.length; i++) {
        if (stopSignalRef.current) break

        const batch = batches[i]
        setStatus(`Reading segment ${i + 1}...`)

        let result: AudioResult | null = null
        try {
          result = await audioPromises[i]
        } catch (err) {
          console.warn('Generation failed', err)
          continue
        }

        if (stopSignalRef.current) break

        // Trigger NEXT batch while current one plays
        triggerGeneration(i + BUFFER_SIZE)

        // HANDLE IMAGE
        if (result && result.status === 'skipped') {
          const idx = batch.globalIndices[0]
          setGlobalSentenceIndex(idx)
          const page = bookStructure.sentenceToPageMap[idx]
          setVisualPageIndex((c) => (c !== page ? page : c))

          const imagePause = 2.0
          nextStartTimeRef.current =
            Math.max(ctx.currentTime, nextStartTimeRef.current) + imagePause

          const waitMs = (nextStartTimeRef.current - ctx.currentTime) * 1000
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        // HANDLE AUDIO
        if (result && result.status === 'success' && result.audio_data) {
          try {
            const rawData = result.audio_data
            const cleanBuffer = rawData.buffer.slice(
              rawData.byteOffset,
              rawData.byteOffset + rawData.byteLength
            ) as ArrayBuffer

            const audioBuffer = await ctx.decodeAudioData(cleanBuffer)

            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)

            const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
            source.start(start)
            nextStartTimeRef.current = start + audioBuffer.duration

            // ESTIMATED HIGHLIGHTING
            const durations = estimateSentenceDurations(batch.sentences, audioBuffer.duration)

            let accumulatedTime = 0
            durations.forEach((dur, idx) => {
              const globalIndex = batch.globalIndices[idx]
              const triggerTime = start + accumulatedTime
              const delayMs = (triggerTime - ctx.currentTime) * 1000

              if (delayMs >= 0) {
                const tid = setTimeout(() => {
                  if (!stopSignalRef.current) {
                    setGlobalSentenceIndex(globalIndex)
                    const page = bookStructure.sentenceToPageMap[globalIndex]
                    setVisualPageIndex((c) => (c !== page ? page : c))
                  }
                }, delayMs)
                playbackTimeoutsRef.current.push(tid)
              }
              accumulatedTime += dur
            })

            // Optimization: If buffer is healthy, relax the CPU
            const timeUntilNext = nextStartTimeRef.current - ctx.currentTime
            if (timeUntilNext > 4) {
              await new Promise((r) => setTimeout(r, (timeUntilNext - 2) * 1000))
            }
          } catch (decodeErr) {
            console.error('Decode Error', decodeErr)
          }
        }
      }

      if (!stopSignalRef.current) {
        setStatus('Completed')
        setIsPlaying(false)
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
    return () => {
      stop()
    }
  }, [])

  return { isPlaying, globalSentenceIndex, status, play, stop }
}
