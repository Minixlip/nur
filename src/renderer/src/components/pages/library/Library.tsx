import React, { useState, useRef, useEffect } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([])

  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  // MERGING LOGIC: Combines small sentences into chunks
  const splitSentences = (text: string) => {
    const rawParts = text.match(/[^.!?,\n]+[.!?,\n]+["']?|[^.!?,\n]+$/g) || [text]
    const merged: string[] = []
    let buffer = ''

    for (const part of rawParts) {
      // Merge if the buffer is less than 30 characters
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

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
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

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
        audioCtxRef.current = null
      } catch (e) {
        console.error(e)
      }
    }
    scheduledNodesRef.current = []

    // @ts-ignore
    await window.api.stop()
  }

  const handleReadAloud = async () => {
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)

    initAudioContext()
    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    const sentences = splitSentences(bookContent)
    const audioPromises = new Array(sentences.length).fill(null)
    const BUFFER_SIZE = 3

    try {
      setStatus('Buffering...')

      // Start initial batch
      for (let i = 0; i < Math.min(sentences.length, BUFFER_SIZE); i++) {
        // @ts-ignore - PASSING 1.2 SPEED HERE
        audioPromises[i] = window.api.generate(sentences[i], 1.2)
      }

      for (let i = 0; i < sentences.length; i++) {
        if (stopSignalRef.current) break
        setCurrentSentenceIndex(i)

        const currentAudioResult = await audioPromises[i]
        if (stopSignalRef.current) break

        // Schedule next batch
        const nextToSchedule = i + BUFFER_SIZE
        if (nextToSchedule < sentences.length && !audioPromises[nextToSchedule]) {
          // @ts-ignore - PASSING 1.2 SPEED HERE
          audioPromises[nextToSchedule] = window.api.generate(sentences[nextToSchedule], 1.2)
        }

        if (currentAudioResult && currentAudioResult.status === 'success') {
          // @ts-ignore
          const rawBuffer = await window.api.loadAudio(currentAudioResult.audio_filepath)
          const audioBuffer = await ctx.decodeAudioData(rawBuffer.buffer)

          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)

          const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
          source.start(start)

          scheduledNodesRef.current.push(source)
          nextStartTimeRef.current = start + audioBuffer.duration

          // Throttle
          const timeUntilPlay = start - ctx.currentTime
          if (timeUntilPlay > 10) {
            setStatus(`Buffered far ahead...`)
            await new Promise((r) => setTimeout(r, (timeUntilPlay - 5) * 1000))
          } else {
            setStatus(`Reading segment ${i + 1}/${sentences.length}...`)
          }
        }
      }
      setStatus('All segments scheduled.')
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
    } finally {
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
