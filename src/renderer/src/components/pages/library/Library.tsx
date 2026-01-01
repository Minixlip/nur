import React, { useState } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState('Idle')

  // Sample text for testing (We can make this dynamic later)
  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  const handleReadAloud = async (): Promise<void> => {
    if (isPlaying) return // Prevent double clicks

    setIsPlaying(true)
    setStatus('Generating Audio...')

    try {
      // 1. Send the book content to the backend
      // @ts-ignore
      const result = await window.api.generateSpeech(bookContent)

      if (result.status === 'success') {
        setStatus('Playing...')

        // The Main process plays the audio natively now, so we just wait a bit
        // In a real app, we would listen for a "playback-finished" event
        setTimeout(() => {
          setStatus('Idle')
          setIsPlaying(false)
        }, 15000) // Reset after 15 seconds (approx length of the text)
      } else {
        setStatus('Error: ' + result.message)
        setIsPlaying(false)
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-white">My Library</h1>
        <div className="text-sm text-gray-400">
          Status:{' '}
          <span className={`${status === 'Playing...' ? 'text-green-400' : 'text-yellow-400'}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Book Viewer */}
      <div className="max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        {/* Book Toolbar */}
        <div className="bg-gray-750 bg-opacity-50 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-white">{bookTitle}</h2>

          <button
            onClick={handleReadAloud}
            disabled={isPlaying}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${
                isPlaying
                  ? 'bg-gray-600 cursor-not-allowed opacity-75'
                  : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/30 shadow-lg'
              }
            `}
          >
            {isPlaying ? (
              <>
                <span className="animate-pulse">●</span> Speaking...
              </>
            ) : (
              <>
                <span>▶</span> Read Aloud
              </>
            )}
          </button>
        </div>

        {/* Book Text */}
        <div className="p-8 leading-relaxed text-lg text-gray-300 font-serif">{bookContent}</div>
      </div>
    </div>
  )
}
