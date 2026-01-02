import React, { useState } from 'react'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents' // Import new component

export default function Library(): React.JSX.Element {
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false) // State for ToC Menu

  const { totalPages, bookTitle, isLoading, error, importBook, bookStructure } = useBookImporter()

  const { isPlaying, globalSentenceIndex, status, play, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  const handleNextPage = () => setVisualPageIndex((p) => Math.min(totalPages - 1, p + 1))
  const handlePrevPage = () => setVisualPageIndex((p) => Math.max(0, p - 1))

  const handleImport = async () => {
    stop()
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

      {/* READER CONTAINER (Added relative for ToC overlay) */}
      <div className="relative max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 min-h-[600px]">
        {/* TABLE OF CONTENTS OVERLAY */}
        <TableOfContents
          items={bookStructure.processedToc || []}
          isOpen={isTocOpen}
          onClose={() => setIsTocOpen(false)}
          currentVisualPage={visualPageIndex}
          onChapterClick={(pageIndex) => setVisualPageIndex(pageIndex)}
        />

        {/* TOOLBAR */}
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          {/* Left: Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={visualPageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ←
            </button>

            {/* Chapter / Title Info (Clickable for ToC) */}
            <button
              onClick={() => setIsTocOpen(true)}
              disabled={totalPages === 0}
              className="text-center px-4 hover:bg-gray-700/50 rounded cursor-pointer transition"
              title="Click to view Chapters"
            >
              <div className="font-semibold text-white italic truncate max-w-[200px]">
                {bookTitle}
              </div>
              <div className="text-xs font-mono text-gray-400">
                Page {visualPageIndex + 1} / {Math.max(1, totalPages)}
              </div>
            </button>

            <button
              onClick={handleNextPage}
              disabled={visualPageIndex >= totalPages - 1}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              →
            </button>
          </div>

          {/* Right: Controls */}
          <div className="flex gap-2">
            {/* Toggle ToC Button (List Icon) */}
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              disabled={totalPages === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
              title="Chapters"
            >
              ☰
            </button>

            {!isPlaying ? (
              <button
                onClick={play}
                disabled={totalPages === 0}
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
        <div className="p-8 h-[65vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          <BookViewer
            bookStructure={bookStructure}
            visualPageIndex={visualPageIndex}
            globalSentenceIndex={globalSentenceIndex}
            isPlaying={isPlaying}
            // Add this line:
            onChapterClick={(pageIndex) => setVisualPageIndex(pageIndex)}
          />
        </div>
      </div>
    </div>
  )
}
