import React, { useState } from 'react'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useLibrary } from '../../../hooks/useLibrary'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'
import { SavedBook } from '@renderer/env'
import Settings from '../settings/Settings' // <--- IMPORT SETTINGS

export default function Library(): React.JSX.Element {
  // --- 1. STATE MANAGEMENT ---
  const { library, addToLibrary, removeBook, updateProgress } = useLibrary()
  const [activeBookId, setActiveBookId] = useState<string | null>(null)

  // UPDATED: Added 'settings' to view modes
  const [viewMode, setViewMode] = useState<'shelf' | 'reader' | 'settings'>('shelf')

  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)

  // --- 2. HOOKS ---
  const { totalPages, bookTitle, isLoading, error, importBook, loadBookByPath, bookStructure } =
    useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  // --- 3. HANDLERS ---

  // Navigation
  const handleNextPage = () => {
    setVisualPageIndex((p) => {
      const newPage = Math.min(totalPages - 1, p + 1)
      if (activeBookId) updateProgress(activeBookId, newPage)
      return newPage
    })
  }
  const handlePrevPage = () => {
    setVisualPageIndex((p) => {
      const newPage = Math.max(0, p - 1)
      if (activeBookId) updateProgress(activeBookId, newPage)
      return newPage
    })
  }

  const handleChapterClick = (pageIndex: number) => {
    setVisualPageIndex(pageIndex)
    if (activeBookId) updateProgress(activeBookId, pageIndex)
  }

  const handleImportNew = async () => {
    const bookData = await importBook(true)
    if (bookData) {
      await addToLibrary(bookData.filePath, bookData.title, bookData.cover || null)
      setVisualPageIndex(0)
      setIsTocOpen(false)
      setViewMode('reader')
    }
  }

  const openBook = async (book: SavedBook) => {
    setActiveBookId(book.id)
    setVisualPageIndex(book.lastPageIndex || 0)
    setIsTocOpen(false)
    setViewMode('reader')
    await loadBookByPath(book.path)
  }

  const goBackToShelf = () => {
    stop()
    setActiveBookId(null)
    setViewMode('shelf')
  }

  // --- 4. RENDER: SETTINGS MODE (NEW) ---
  if (viewMode === 'settings') {
    return (
      <div className="min-h-screen bg-gray-900 relative">
        <div className="p-6 border-b border-gray-800 flex items-center gap-4">
          <button
            onClick={() => setViewMode('shelf')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <span>←</span> Back to Library
          </button>
        </div>
        <Settings />
      </div>
    )
  }

  // --- 5. RENDER: SHELF MODE ---
  if (viewMode === 'shelf') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold text-white">My Library</h1>

          <div className="flex gap-4">
            {/* SETTINGS BUTTON (NEW) */}
            <button
              onClick={() => setViewMode('settings')}
              className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition shadow-lg border border-gray-700"
              title="Settings"
            >
              ⚙️
            </button>

            <button
              onClick={handleImportNew}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg text-white flex items-center gap-2"
            >
              <span>+</span> Add Book
            </button>
          </div>
        </div>

        {/* BOOK GRID */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {library.map((book) => (
            <div
              key={book.id}
              onClick={() => openBook(book)}
              className="group relative bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 hover:-translate-y-1 transition-all duration-300 shadow-xl border border-gray-700"
            >
              <div className="aspect-2/3 bg-indigo-900/50 rounded-lg mb-4 flex items-center justify-center group-hover:bg-indigo-800/50 transition shadow-inner overflow-hidden relative">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">📖</span>
                )}
              </div>

              <h3 className="font-bold text-gray-200 line-clamp-2 min-h-12 leading-tight">
                {book.title}
              </h3>
              <p className="text-xs text-gray-500 mt-2">
                {new Date(book.dateAdded).toLocaleDateString()}
              </p>

              <button
                onClick={(e) => removeBook(book.id, e)}
                className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                title="Delete Book"
              >
                ✕
              </button>
            </div>
          ))}

          {library.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
              <p className="text-xl font-semibold mb-2">Your library is empty</p>
              <p className="text-sm">Click "Add Book" to import your first EPUB</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- 6. RENDER: READER MODE ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {/* READER HEADER */}
      <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-4">
        <div>
          <button
            onClick={goBackToShelf}
            className="text-gray-400 hover:text-white flex items-center gap-2 text-sm font-semibold transition-colors"
          >
            <span>←</span> Back to Shelf
          </button>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">
            Status: <span className="text-indigo-400">{status}</span>
          </p>
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
      </div>

      {/* READER CONTAINER */}
      <div className="relative max-w-4xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 min-h-150 flex flex-col">
        <TableOfContents
          items={bookStructure.processedToc || []}
          isOpen={isTocOpen}
          onClose={() => setIsTocOpen(false)}
          currentVisualPage={visualPageIndex}
          onChapterClick={handleChapterClick}
        />

        {/* TOOLBAR */}
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevPage}
              disabled={visualPageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 text-gray-300"
            >
              ←
            </button>

            <button
              onClick={() => setIsTocOpen(true)}
              disabled={totalPages === 0}
              className="text-center px-4 py-1 hover:bg-gray-700/50 rounded cursor-pointer transition"
              title="View Chapters"
            >
              <div className="font-semibold text-white italic truncate max-w-50 md:max-w-75">
                {bookTitle}
              </div>
              <div className="text-xs font-mono text-gray-400">
                Page {visualPageIndex + 1} / {Math.max(1, totalPages)}
              </div>
            </button>

            <button
              onClick={handleNextPage}
              disabled={visualPageIndex >= totalPages - 1}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 text-gray-300"
            >
              →
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300"
              title="Table of Contents"
            >
              ☰
            </button>

            {!isPlaying ? (
              <button
                onClick={play}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all text-white"
              >
                <span>▶</span> Read
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button
                    onClick={play}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg transition-all text-white"
                  >
                    <span>▶</span> Resume
                  </button>
                ) : (
                  <button
                    onClick={pause}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-bold shadow-lg transition-all text-white"
                  >
                    <span>⏸</span> Pause
                  </button>
                )}

                <button
                  onClick={stop}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-lg transition-all text-white"
                >
                  <span>⏹</span> Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* BOOK CONTENT AREA */}
        <div className="flex-1 p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-gray-400 animate-pulse">
              Loading Book Content...
            </div>
          ) : (
            <BookViewer
              bookStructure={bookStructure}
              visualPageIndex={visualPageIndex}
              globalSentenceIndex={globalSentenceIndex}
              isPlaying={isPlaying}
              onChapterClick={handleChapterClick}
            />
          )}
        </div>
      </div>
    </div>
  )
}
