import React, { useState, useRef, useEffect } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)

  // --- GAPLESS AUDIO CONTEXT REFS ---
  // The AudioContext handles the timing precision
  const audioCtxRef = useRef<AudioContext | null>(null)
  // We track when the *next* chunk should play
  const nextStartTimeRef = useRef(0)
  // Keep track of scheduled nodes so we can stop them
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([])

  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  // FIX: Merge short chunks to reduce overhead
  const splitSentences = (text: string) => {
    // 1. Initial split by punctuation
    const rawParts = text.match(/[^.!?,\n]+[.!?,\n]+["']?|[^.!?,\n]+$/g) || [text]

    const merged: string[] = []
    let buffer = ''

    // 2. Merge chunks shorter than 30 characters
    for (const part of rawParts) {
      if ((buffer + part).length < 30) {
        buffer += ' ' + part
      } else {
        if (buffer) merged.push(buffer.trim())
        buffer = part
      }
    }
    if (buffer) merged.push(buffer.trim())

    return merged
  }

  // Initialize Audio Context (must be user triggered)
  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      // @ts-ignore - Standard or Webkit
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    // Resume if it was suspended
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
  }

  const handleStop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')
    setCurrentSentenceIndex(-1)

    // Stop all browser audio immediately
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close() // Kill the context
        audioCtxRef.current = null // Reset so we create a new one next time
      } catch (e) {
        console.error('Error closing audio context:', e)
      }
    }
    scheduledNodesRef.current = []

    // Also stop backend just in case
    // @ts-ignore
    await window.api.stop()
  }

  const handleReadAloud = async () => {
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)

    // 1. Setup Audio Engine
    initAudioContext()
    const ctx = audioCtxRef.current
    if (!ctx) return

    // Reset timing: Play immediately (or slightly in future to avoid glitches)
    nextStartTimeRef.current = ctx.currentTime + 0.1

    const sentences = splitSentences(bookContent)

    // 2. Buffer System (Same as before)
    // ... inside your loops
    // @ts-ignore
    audioPromises[i] = window.api.generate(sentences[i], 1.2) // 1.2x speed
    const BUFFER_SIZE = 3

    try {
      setStatus('Buffering...')

      // Start initial batch
      for (let i = 0; i < Math.min(sentences.length, BUFFER_SIZE); i++) {
        // @ts-ignore
        audioPromises[i] = window.api.generate(sentences[i])
      }

      // 3. The Scheduling Loop
      for (let i = 0; i < sentences.length; i++) {
        if (stopSignalRef.current) break

        setCurrentSentenceIndex(i)

        // A. Wait for generation
        const currentAudioResult = await audioPromises[i]
        if (stopSignalRef.current) break

        // B. Keep Buffer Full (Generate future sentences)
        const nextToSchedule = i + BUFFER_SIZE
        if (nextToSchedule < sentences.length && !audioPromises[nextToSchedule]) {
          // @ts-ignore
          audioPromises[nextToSchedule] = window.api.generate(sentences[nextToSchedule])
        }

        if (currentAudioResult && currentAudioResult.status === 'success') {
          // C. Load Audio Data from Backend
          // @ts-ignore
          const rawBuffer = await window.api.loadAudio(currentAudioResult.audio_filepath)

          // D. Decode and Schedule
          // This is the magic part: We decode the WAV file in the browser
          const audioBuffer = await ctx.decodeAudioData(rawBuffer.buffer)

          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)

          // E. Schedule Gapless Playback
          // We tell it to start exactly when the previous one ends
          const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
          source.start(start)

          // Track this node so we can stop it if needed
          scheduledNodesRef.current.push(source)

          // Advance the "cursor" for the next sentence
          nextStartTimeRef.current = start + audioBuffer.duration

          // Cleanup old nodes to save memory
          source.onended = () => {
            // Optional: visual cleanup or progress updates could go here
            // But be careful, 'onended' fires when audio finishes, not when loop continues
          }

          // F. IMPORTANT: Throttle the Loop
          // In the previous version, we waited for playback to finish.
          // In this version, we MUST NOT wait for playback, or we lose the gapless benefit.
          // HOWEVER, we shouldn't run 100 sentences ahead of the audio.
          // Let's check: If we are more than 10 seconds ahead, wait a bit.
          const timeUntilPlay = start - ctx.currentTime
          if (timeUntilPlay > 10) {
            setStatus(`Buffered far ahead...`)
            // Wait until we are closer to playback time to save memory
            await new Promise((r) => setTimeout(r, (timeUntilPlay - 5) * 1000))
          } else {
            setStatus(`Scheduling segment ${i + 1}/${sentences.length}...`)
          }
        }
      }

      setStatus('All segments scheduled.')
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
    } finally {
      // We don't turn off 'isPlaying' immediately because audio might still be playing from the queue!
      // But for this simple implementation, we can leave it or handle 'onended' of the last node.
      if (stopSignalRef.current) {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
  }

  useEffect(() => {
    return () => {
      handleStop()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-white">My Library</h1>
        <div className="text-sm font-mono text-gray-400">
          Status: <span className="text-indigo-400">{status}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white italic">{bookTitle}</h2>
          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={handleReadAloud}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>▶</span> Read Book
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>⏹</span> Stop
              </button>
            )}
          </div>
        </div>
        <div className="p-8 leading-relaxed text-lg text-gray-300 font-serif">
          {splitSentences(bookContent).map((sentence, index) => (
            <span
              key={index}
              className={`transition-all duration-300 px-1 rounded ${index === currentSentenceIndex && isPlaying ? 'bg-indigo-600/40 text-white shadow-sm box-decoration-clone' : ''}`}
            >
              {sentence}{' '}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
