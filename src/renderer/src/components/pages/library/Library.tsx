import React, { useState, useRef, useEffect } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  // Refs are critical here to break the async loop instantly when "Stop" is clicked
  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)

  // Sample Text (Long enough to test streaming)
  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  // Helper: Intelligent sentence splitting
  const splitSentences = (text: string) => {
    // Matches sentences ending in . ! ? or "
    return text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text]
  }

  const handleStop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')
    setCurrentSentenceIndex(-1)

    // Tell Main process to kill the audio player immediately
    // @ts-ignore
    await window.api.stop()
  }

  const handleReadAloud = async () => {
    if (isPlayingRef.current) return // Prevent double-click

    // Reset State
    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)

    const sentences = splitSentences(bookContent)

    try {
      setStatus('Buffering...')

      // 1. Kickstart: Start generating Sentence #1 immediately
      let nextAudioPromise = null
      // @ts-ignore
      nextAudioPromise = window.api.generate(sentences[0])

      // 2. The Loop
      for (let i = 0; i < sentences.length; i++) {
        // Check stop signal at start of every iteration
        if (stopSignalRef.current) break

        setCurrentSentenceIndex(i)
        setStatus(`Reading sentence ${i + 1}/${sentences.length}...`)

        // A. Wait for the CURRENT sentence to finish generating
        const currentAudioResult = await nextAudioPromise

        if (stopSignalRef.current) break // Check again after await

        // B. Optimization: Start generating the NEXT sentence *before* we play the current one
        if (i + 1 < sentences.length) {
          // @ts-ignore
          nextAudioPromise = window.api.generate(sentences[i + 1])
        }

        // C. Play the current sentence (this waits until audio finishes)
        if (currentAudioResult && currentAudioResult.status === 'success') {
          // @ts-ignore
          await window.api.play(currentAudioResult.audio_filepath)
        }
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
    } finally {
      // Cleanup when done or stopped
      if (!stopSignalRef.current) {
        setStatus('Finished')
        setCurrentSentenceIndex(-1)
      }
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }

  // Safety: Stop audio if user navigates away
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
        {/* Toolbar */}
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white italic">{bookTitle}</h2>

          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={handleReadAloud}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
              >
                <span>▶</span> Read Book
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
              >
                <span>⏹</span> Stop
              </button>
            )}
          </div>
        </div>

        {/* Text Area with Highlighting */}
        <div className="p-8 leading-relaxed text-lg text-gray-300 font-serif">
          {splitSentences(bookContent).map((sentence, index) => (
            <span
              key={index}
              className={`transition-all duration-300 px-1 rounded ${
                index === currentSentenceIndex && isPlaying
                  ? 'bg-indigo-600/40 text-white shadow-sm box-decoration-clone'
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
