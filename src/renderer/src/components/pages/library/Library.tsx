import React, { useState } from 'react'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useLibrary } from '../../../hooks/useLibrary' // Import new hook
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'

export default function Library(): React.JSX.Element {
  // 1. LIBRARY STATE
  const { library, refreshLibrary, addToLibrary, removeBook } = useLibrary()
  const [viewMode, setViewMode] = useState<'shelf' | 'reader'>('shelf')

  // 2. READER STATE
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)

  // 3. HOOKS
  const {
    totalPages,
    bookTitle,
    isLoading,
    error,
    importBook,
    bookStructure,
    // We need to expose a way to load a specific file path now
    loadBookByPath
  } = useBookImporter()

  const { isPlaying, globalSentenceIndex, status, play, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  // --- HANDLERS ---

  // User clicks "Import New Book"
  const handleImportNew = async () => {
    // 1. Let user pick file and parse it (to get title)
    const bookData = await importBook(true) // Pass 'true' to signal we want to save
    if (bookData) {
      // 2. Save to Library
      await addToLibrary(bookData.filePath, bookData.title)
      // 3. Open Reader
      setViewMode('reader')
    }
  }

  // User clicks a book on the shelf
  const openBook = async (book: SavedBook) => {
    setViewMode('reader')
    // You need to update useBookImporter to accept a path directly
    await loadBookByPath(book.path)
  }

  const goBackToShelf = () => {
    stop()
    setViewMode('shelf')
  }

  // ... (Keep your existing Navigation Handlers: handleNextPage, etc) ...

  // --- RENDER ---

  if (viewMode === 'shelf') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold text-white">My Library</h1>
          <button
            onClick={handleImportNew}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold shadow-lg text-white"
          >
            + Add Book
          </button>
        </div>

        {/* BOOK GRID */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {library.map((book) => (
            <div
              key={book.id}
              onClick={() => openBook(book)}
              className="group relative bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 hover:-translate-y-1 transition-all duration-300 shadow-xl border border-gray-700"
            >
              {/* Placeholder Cover */}
              <div className="aspect-[2/3] bg-indigo-900/50 rounded-lg mb-4 flex items-center justify-center group-hover:bg-indigo-800/50 transition">
                <span className="text-4xl">📖</span>
              </div>
              <h3 className="font-bold text-gray-200 line-clamp-2 min-h-[3rem]">{book.title}</h3>
              <p className="text-xs text-gray-500 mt-2">
                {new Date(book.dateAdded).toLocaleDateString()}
              </p>

              {/* Delete Button (Visible on Hover) */}
              <button
                onClick={(e) => removeBook(book.id, e)}
                className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete Book"
              >
                ✕
              </button>
            </div>
          ))}

          {library.length === 0 && (
            <div className="col-span-full text-center py-20 text-gray-500">
              <p className="text-xl">Your library is empty.</p>
              <p>Import a book to get started!</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // READER VIEW (Your existing UI)
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      {/* Update Header to have a "Back" button */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={goBackToShelf}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            <span>←</span> Back to Shelf
          </button>
        </div>
        {/* ... rest of header ... */}
      </div>

      {/* ... rest of your existing Reader UI ... */}
    </div>
  )
}
