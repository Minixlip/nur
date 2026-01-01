import React, { useState, useRef, useEffect } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  // Refs for managing state inside async loops
  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)

  // Sample Book Content (Longer for testing)
  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  // Helper: Split text into clean sentences
  const splitSentences = (text: string) => {
    return text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text]
  }

  const handleStop = async () => {
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')
    // @ts-ignore
    await window.api.stop()
  }

  const handleReadAloud = async () => {
    if (isPlayingRef.current) return

    // Reset State
    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)

    const sentences = splitSentences(bookContent)

    // --- THE SMART QUEUE LOOP ---
    try {
      // 1. Pre-generate the first sentence to start quickly
      setStatus('Buffering...')
      let nextAudioPromise = null

      // Start generating the first one immediately
      // @ts-ignore
      nextAudioPromise = window.api.generate(sentences[0])

      for (let i = 0; i < sentences.length; i++) {
        if (stopSignalRef.current) break

        setCurrentSentenceIndex(i)
        setStatus(`Reading sentence ${i + 1}/${sentences.length}...`)

        // A. Wait for the CURRENT audio to be ready
        const currentAudio = await nextAudioPromise

        // B. Start generating the NEXT audio (if existing) while current plays
        if (i + 1 < sentences.length) {
          // @ts-ignore
          nextAudioPromise = window.api.generate(sentences[i + 1])
        }

        // C. Play the current audio (Waits until finished)
        if (currentAudio.status === 'success' && !stopSignalRef.current) {
          // @ts-ignore
          await window.api.play(currentAudio.audio_filepath)
        }
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
    } finally {
      setIsPlaying(false)
      isPlayingRef.current = false
      setStatus('Finished')
    }
  }

  // Stop audio if user leaves the page
  useEffect(() => {
    return () => {
      handleStop()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {/* Header */}
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
              className={`transition-colors duration-300 ${
                index === currentSentenceIndex && isPlaying
                  ? 'bg-indigo-500/30 text-white rounded px-1 box-decoration-clone'
                  : ''
              }`}
            >
              {sentence}{' '}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
