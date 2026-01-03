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

interface HighlightTrigger {
  time: number
  globalIndex: number
}

// --- CONSTANTS ---
const BATCH_RAMP = [15, 20, 25]
const BATCH_SIZE_STANDARD = 35

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
  const [isPaused, setIsPaused] = useState(false) // <--- NEW STATE
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const isPausedRef = useRef(false) // <--- NEW REF (for loops)
  const stopSignalRef = useRef(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const highlightScheduleRef = useRef<HighlightTrigger[]>([]) // <--- NEW: Central Schedule

  // Session Tracking
  const currentSessionId = useRef<string>('')

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    // Always ensure it's running when we init
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }

  // --- CONTROLS ---

  const pause = async () => {
    if (!isPlayingRef.current || isPausedRef.current) return
    console.log('Pausing...')

    // 1. Update State
    isPausedRef.current = true
    setIsPaused(true)

    // 2. Freeze Hardware
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

    // 1. INVALIDATE SESSION
    currentSessionId.current = ''
    await window.api.setSession('')

    // 2. RESET STATE
    setIsPlaying(false)
    setIsPaused(false)
    setStatus('Stopped')
    setGlobalSentenceIndex(-1)

    // 3. CLEANUP
    highlightScheduleRef.current = [] // Clear highlighting queue

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
    // A. RESUME IF PAUSED
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

    // B. START FRESH
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    isPausedRef.current = false // Ensure not paused
    setIsPlaying(true)
    setIsPaused(false)

    initAudioContext()

    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    // New Session
    const newSessionId = Date.now().toString()
    currentSessionId.current = newSessionId
    await window.api.setSession(newSessionId)

    // --- BUILD BATCHES ---
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
          batchIndex++
        }
        batches.push({ text: '[[[IMAGE]]]', sentences: [text], globalIndices: [globalIdx] })
        continue
      }

      const wordCount = text.split(/\s+/).length
      currentBatchText.push(text)
      currentBatchIndices.push(globalIdx)
      currentWordCount += wordCount

      const targetSize =
        batchIndex < BATCH_RAMP.length ? BATCH_RAMP[batchIndex] : BATCH_SIZE_STANDARD

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
    if (currentBatchText.length > 0) {
      batches.push({
        text: currentBatchText.join(' '),
        sentences: [...currentBatchText],
        globalIndices: [...currentBatchIndices]
      })
    }

    // --- PIPELINE ---
    const audioPromises: Promise<AudioResult>[] = new Array(batches.length).fill(null)
    const BUFFER_SIZE = 3

    const triggerGeneration = (index: number) => {
      if (index >= batches.length) return
      const batch = batches[index]
      if (batch.text === '[[[IMAGE]]]') {
        audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
      } else {
        audioPromises[index] = window.api.generate(batch.text, 1.2, newSessionId)
      }
    }

    try {
      setStatus('Buffering...')
      const initialFetch = Math.min(batches.length, BUFFER_SIZE)
      for (let i = 0; i < initialFetch; i++) triggerGeneration(i)

      if (batches.length > 0) await audioPromises[0]

      // --- MAIN LOOP ---
      for (let i = 0; i < batches.length; i++) {
        // PAUSE CHECK: Freeze loop if paused
        while (isPausedRef.current) {
          if (stopSignalRef.current) break
          await new Promise((r) => setTimeout(r, 200)) // Wait 200ms and check again
        }

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
        triggerGeneration(i + BUFFER_SIZE)

        // IMAGE
        if (result && result.status === 'skipped') {
          const idx = batch.globalIndices[0]

          // Add to schedule immediately
          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current)
          highlightScheduleRef.current.push({ time: startTime, globalIndex: idx })

          const imagePause = 2.0
          nextStartTimeRef.current = startTime + imagePause

          // Wait physical time so loop doesn't race ahead
          const waitMs = (nextStartTimeRef.current - ctx.currentTime) * 1000
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        // AUDIO
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

            // SCHEDULING (Replaces setTimeout)
            const durations = estimateSentenceDurations(batch.sentences, audioBuffer.duration)
            let accumulatedTime = 0
            durations.forEach((dur, idx) => {
              const triggerTime = start + accumulatedTime
              highlightScheduleRef.current.push({
                time: triggerTime,
                globalIndex: batch.globalIndices[idx]
              })
              accumulatedTime += dur
            })

            // Sort schedule just in case
            highlightScheduleRef.current.sort((a, b) => a.time - b.time)

            // Relax CPU
            const timeUntilNext = nextStartTimeRef.current - ctx.currentTime
            if (timeUntilNext > 4) {
              // Wait, but respect pause
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

  // --- HIGHLIGHT SYNC LOOP (Replaces setTimeout) ---
  // Checks every 50ms what the current audio time is and updates highlight
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlayingRef.current || isPausedRef.current || !audioCtxRef.current) return

      const t = audioCtxRef.current.currentTime
      const schedule = highlightScheduleRef.current

      if (schedule.length === 0) return

      // Find the latest trigger that has passed
      let lastPassedIndex = -1
      for (let i = 0; i < schedule.length; i++) {
        if (schedule[i].time <= t + 0.05) {
          // 50ms tolerance
          lastPassedIndex = i
        } else {
          break
        }
      }

      if (lastPassedIndex !== -1) {
        const trigger = schedule[lastPassedIndex]

        // Update Highlight
        setGlobalSentenceIndex((prev) => {
          if (prev !== trigger.globalIndex) {
            // Sync Page
            const page = bookStructure.sentenceToPageMap[trigger.globalIndex]
            setVisualPageIndex((c) => (c !== page ? page : c))
            return trigger.globalIndex
          }
          return prev
        })

        // Cleanup processed items
        highlightScheduleRef.current = schedule.slice(lastPassedIndex + 1)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [bookStructure]) // Re-create if book changes

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop }
}
