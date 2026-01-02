import { useState, useRef, useEffect } from 'react'

// Define the promise result type explicitly
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
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([])
  const playbackTimeoutsRef = useRef<NodeJS.Timeout[]>([])

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      // Standard typescript knows window.AudioContext.
      // webkitAudioContext is a legacy fallback usually not in strict TS types.
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

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
        audioCtxRef.current = null
      } catch (e) {
        console.error(e)
      }
    }
    scheduledNodesRef.current = []
    playbackTimeoutsRef.current.forEach((id) => clearTimeout(id))
    playbackTimeoutsRef.current = []

    // Typesafe call!
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

    const sentences = bookStructure.allSentences
    const startSentenceIndex = bookStructure.sentenceToPageMap.findIndex(
      (p) => p === visualPageIndex
    )
    const safeStartIndex = startSentenceIndex >= 0 ? startSentenceIndex : 0
    const activeSentences = sentences.slice(safeStartIndex)
    const getGlobalIndex = (localIndex: number) => safeStartIndex + localIndex

    // Type the promise array
    const audioPromises: Promise<AudioResult>[] = new Array(activeSentences.length).fill(null)
    const BUFFER_SIZE = 3
    const STARTUP_BUFFER = 2

    try {
      setStatus('Buffering...')

      const triggerGeneration = (index: number) => {
        if (index >= activeSentences.length) return
        const text = activeSentences[index]
        if (text.includes('[[[IMG_MARKER')) {
          audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
        } else {
          // Typesafe call!
          audioPromises[index] = window.api.generate(text, 1.2)
        }
      }

      const initialBatch = Math.min(activeSentences.length, BUFFER_SIZE)
      for (let i = 0; i < initialBatch; i++) triggerGeneration(i)

      const waitCount = Math.min(activeSentences.length, STARTUP_BUFFER)
      if (waitCount > 0) {
        setStatus(`Buffering ${waitCount} segments...`)
        try {
          await Promise.all(audioPromises.slice(0, waitCount))
        } catch (err) {
          console.warn(err)
        }
      }

      for (let i = 0; i < activeSentences.length; i++) {
        if (stopSignalRef.current) break

        const globalIndex = getGlobalIndex(i)
        setStatus(`Reading chunk ${i + 1}...`)

        let result: AudioResult | null = null
        try {
          result = await audioPromises[i]
        } catch (err) {
          continue
        }

        if (stopSignalRef.current) break
        triggerGeneration(i + BUFFER_SIZE)

        if (result && result.status === 'skipped') {
          setGlobalSentenceIndex(globalIndex)
          const pageOfThisSentence = bookStructure.sentenceToPageMap[globalIndex]
          setVisualPageIndex((c) => (c !== pageOfThisSentence ? pageOfThisSentence : c))

          const imagePause = 2.0
          nextStartTimeRef.current =
            Math.max(ctx.currentTime, nextStartTimeRef.current) + imagePause
          await new Promise((r) => setTimeout(r, imagePause * 1000))
          continue
        }

        if (result && result.status === 'success' && result.audio_data) {
          try {
            // Ensure clean buffer copy
            const rawData = result.audio_data

            // FIX: Explicitly cast to ArrayBuffer to satisfy TypeScript
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
            scheduledNodesRef.current.push(source)

            if (i === activeSentences.length - 1) {
              source.onended = () => {
                if (!stopSignalRef.current) {
                  setIsPlaying(false)
                  isPlayingRef.current = false
                  setStatus('Completed')
                  setGlobalSentenceIndex(-1)
                }
              }
            }

            const delayMs = (start - ctx.currentTime) * 1000
            const timeoutId = setTimeout(() => {
              if (!stopSignalRef.current) {
                setGlobalSentenceIndex(globalIndex)
                const pageOfThisSentence = bookStructure.sentenceToPageMap[globalIndex]
                setVisualPageIndex((c) => (c !== pageOfThisSentence ? pageOfThisSentence : c))
              }
            }, delayMs)
            playbackTimeoutsRef.current.push(timeoutId)

            nextStartTimeRef.current = start + audioBuffer.duration

            const timeUntilPlay = start - ctx.currentTime
            if (timeUntilPlay > 15) {
              await new Promise((r) => setTimeout(r, (timeUntilPlay - 5) * 1000))
            }
          } catch (decodeErr) {
            console.error('Decode Error', decodeErr)
          }
        }
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
      isPlayingRef.current = false
    } finally {
      if (stopSignalRef.current) {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
  }

  useEffect(() => {
    return () => {
      stop()
    }
  }, [])

  return { isPlaying, globalSentenceIndex, status, play, stop }
}
