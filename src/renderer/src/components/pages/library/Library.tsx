import React, { useState } from 'react'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { BookViewer } from '../../bookViewer'

export default function Library(): React.JSX.Element {
  const [visualPageIndex, setVisualPageIndex] = useState(0)

  // 1. Hooks manage the heavy logic
  const { bookPages, bookTitle, isLoading, error, importBook, bookStructure } = useBookImporter()

  const { isPlaying, globalSentenceIndex, status, play, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  // 2. Handlers
  const handleNextPage = () => setVisualPageIndex((p) => Math.min(bookPages.length - 1, p + 1))
  const handlePrevPage = () => setVisualPageIndex((p) => Math.max(0, p - 1))

  const handleImport = async () => {
    stop() // Safety stop before importing
    await importBook()
    setVisualPageIndex(0)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white">My Library</h1>
          <p className="text-gray-400 text-sm mt-1">
            Status: <span className="text-indigo-400">{status}</span>
          </p>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
        <button
          onClick={handleImport}
          disabled={isLoading || isPlaying}
          className={`px-4 py-2 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2 ${isLoading ? 'bg-gray-700 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
        >
          {isLoading ? 'Parsing...' : '📂 Import .epub'}
        </button>
      </div>

      {/* READER CONTAINER */}
      <div className="max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        {/* TOOLBAR */}
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevPage}
              disabled={visualPageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ←
            </button>
            <div className="text-center">
              <div className="font-semibold text-white italic truncate max-w-[200px]">
                {bookTitle}
              </div>
              <div className="text-xs font-mono text-gray-400">
                Chapter {visualPageIndex + 1} / {bookPages.length}
              </div>
            </div>
            <button
              onClick={handleNextPage}
              disabled={visualPageIndex === bookPages.length - 1}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              →
            </button>
          </div>
          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={play}
                disabled={bookPages.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>▶</span> Read
              </button>
            ) : (
              <button
                onClick={stop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>⏹</span> Stop
              </button>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-8 min-h-[500px] max-h-[70vh] overflow-y-auto">
          <BookViewer
            bookStructure={bookStructure}
            visualPageIndex={visualPageIndex}
            globalSentenceIndex={globalSentenceIndex}
            isPlaying={isPlaying}
          />
        </div>
      </div>
    </div>
  )
}
