import React, { useState } from 'react'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useLibrary } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'
import AppearanceMenu from '../../AppearanceMenu'
import { SavedBook } from '@renderer/env'
import Settings from '../settings/Settings'

export default function Library(): React.JSX.Element {
  const { library, addToLibrary, removeBook, updateProgress } = useLibrary()
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'shelf' | 'reader' | 'settings'>('shelf')
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
  const { settings, updateSetting } = useReaderSettings()

  const { totalPages, bookTitle, isLoading, error, importBook, loadBookByPath, bookStructure } =
    useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  // --- HANDLERS ---
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

  // --- UI COMPONENTS ---

  // 1. SIDEBAR (The Glassy Left Panel)
  const Sidebar = () => (
    <aside className="w-64 flex-shrink-0 bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col p-4 gap-6 z-20">
      {/* Window Controls Placeholder (Mac style) */}
      <div className="flex gap-2 px-2">
        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
      </div>

      <nav className="flex flex-col gap-2 mt-4">
        <button
          onClick={goBackToShelf}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
            viewMode === 'shelf'
              ? 'bg-white/10 text-white shadow-inner'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
          }`}
        >
          <span className="text-lg">📚</span> My Library
        </button>
        <button
          onClick={() => setViewMode('settings')}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
            viewMode === 'settings'
              ? 'bg-white/10 text-white shadow-inner'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
          }`}
        >
          <span className="text-lg">⚙️</span> Settings
        </button>
      </nav>

      {/* RECENT READS MINI SECTION */}
      <div className="mt-auto">
        <h4 className="px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
          Recent Reads
        </h4>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {library.slice(0, 3).map((book) => (
            <div
              key={book.id}
              onClick={() => openBook(book)}
              className="w-12 h-16 bg-zinc-800 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition flex-shrink-0 border border-white/10"
            >
              {book.cover ? (
                <img src={book.cover} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs">📖</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )

  // 2. FLOATING PLAYER (The Pill at the bottom)
  const FloatingPlayer = () => {
    if (viewMode !== 'reader') return null
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/10 pl-4 pr-6 py-3 rounded-full shadow-2xl flex items-center gap-6 transition-all hover:scale-105 hover:bg-zinc-900">
          {/* Play/Pause Circle */}
          <button
            onClick={isPlaying ? (isPaused ? play : pause) : play}
            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-zinc-200 transition active:scale-95"
          >
            {isPlaying && !isPaused ? (
              <span className="text-xl font-bold">⏸</span>
            ) : (
              <span className="text-xl font-bold ml-1">▶</span>
            )}
          </button>

          {/* Fake Waveform / Progress */}
          <div className="flex flex-col gap-1 w-48">
            {/* We use a simple visualizer placeholder or progress bar */}
            <div className="h-8 flex items-center gap-1 opacity-50">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-white rounded-full transition-all duration-300 ${isPlaying && !isPaused ? 'animate-pulse' : ''}`}
                  style={{ height: `${Math.random() * 20 + 8}px` }}
                ></div>
              ))}
            </div>
          </div>

          {/* Info & Controls */}
          <div className="flex items-center gap-4 border-l border-white/10 pl-4">
            <div className="text-xs">
              <div className="text-zinc-400">Status</div>
              <div className="text-emerald-400 font-mono">{status}</div>
            </div>

            <button onClick={stop} className="text-zinc-400 hover:text-red-400 transition">
              ⏹
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- MAIN RENDER ---
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* LEFT SIDEBAR (Always visible or contextual) */}
      <Sidebar />

      {/* RIGHT CONTENT AREA */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
        {/* VIEW: SETTINGS */}
        {viewMode === 'settings' && (
          <div className="h-full overflow-y-auto">
            <Settings />
          </div>
        )}

        {/* VIEW: SHELF */}
        {viewMode === 'shelf' && (
          <div className="p-8 h-full overflow-y-auto">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight mb-2">My Library</h1>
                <p className="text-zinc-400">Continue your reading journey.</p>
              </div>
              <button
                onClick={handleImportNew}
                className="px-5 py-2.5 bg-white text-black hover:bg-zinc-200 rounded-full font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2"
              >
                <span>+</span> Add Book
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {library.map((book) => (
                <div
                  key={book.id}
                  onClick={() => openBook(book)}
                  className="group relative cursor-pointer"
                >
                  <div className="aspect-[2/3] bg-zinc-800 rounded-xl mb-4 overflow-hidden shadow-xl group-hover:shadow-2xl group-hover:-translate-y-2 transition-all duration-300 border border-white/5 relative">
                    {book.cover ? (
                      <img src={book.cover} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-900 p-4 text-center">
                        <span className="text-4xl mb-2">📖</span>
                      </div>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm transform scale-90 group-hover:scale-100 transition-transform">
                        Read
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-zinc-200 leading-tight truncate px-1">
                    {book.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 px-1">
                    {new Date(book.dateAdded).toLocaleDateString()}
                  </p>

                  <button
                    onClick={(e) => removeBook(book.id, e)}
                    className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {library.length === 0 && (
                <div
                  onClick={handleImportNew}
                  className="aspect-[2/3] border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 cursor-pointer transition"
                >
                  <span className="text-2xl mb-2">+</span>
                  <span>Import EPUB</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: READER */}
        {viewMode === 'reader' && (
          <div className="flex-1 flex flex-col h-full relative">
            {/* Minimal Reader Header */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-40 pointer-events-none">
              <button
                onClick={goBackToShelf}
                className="pointer-events-auto w-10 h-10 rounded-full bg-zinc-900/50 backdrop-blur border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                ←
              </button>

              {/* Floating Action Menu (Right Side) */}
              <div className="pointer-events-auto flex gap-2">
                <div className="relative">
                  <button
                    onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
                    className="w-10 h-10 rounded-full bg-zinc-900/50 backdrop-blur border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  >
                    Aa
                  </button>
                  <AppearanceMenu
                    isOpen={isAppearanceOpen}
                    onClose={() => setIsAppearanceOpen(false)}
                    settings={settings}
                    updateSetting={updateSetting}
                  />
                </div>
                <button
                  onClick={() => setIsTocOpen(!isTocOpen)}
                  className="w-10 h-10 rounded-full bg-zinc-900/50 backdrop-blur border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  ☰
                </button>
              </div>
            </div>

            {/* Overlays */}
            <TableOfContents
              items={bookStructure.processedToc || []}
              isOpen={isTocOpen}
              onClose={() => setIsTocOpen(false)}
              currentVisualPage={visualPageIndex}
              onChapterClick={handleChapterClick}
            />

            {/* Content Area */}
            <div
              className={`flex-1 overflow-y-auto scrollbar-thin transition-colors duration-500 ${
                settings.theme === 'light'
                  ? 'bg-[#fcfbf9]'
                  : settings.theme === 'sepia'
                    ? 'bg-[#f4ecd8]'
                    : 'bg-[#18181b]' // Zinc-950 for Dark
              }`}
            >
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-zinc-500 animate-pulse">
                  Opening Book...
                </div>
              ) : (
                <div className="pt-20 pb-40 px-4 md:px-0">
                  {' '}
                  {/* Padding for header/footer */}
                  <BookViewer
                    bookStructure={bookStructure}
                    visualPageIndex={visualPageIndex}
                    globalSentenceIndex={globalSentenceIndex}
                    isPlaying={isPlaying}
                    onChapterClick={handleChapterClick}
                    settings={settings}
                  />
                  {/* Pagination - Simple Bottom */}
                  <div
                    className={`flex justify-center items-center gap-8 mt-10 pb-10 opacity-50 hover:opacity-100 transition-opacity ${settings.theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}
                  >
                    <button
                      onClick={handlePrevPage}
                      disabled={visualPageIndex === 0}
                      className="hover:text-indigo-500 disabled:opacity-30"
                    >
                      Previous Page
                    </button>
                    <span className="font-mono text-xs">
                      {visualPageIndex + 1} / {totalPages}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={visualPageIndex >= totalPages - 1}
                      className="hover:text-indigo-500 disabled:opacity-30"
                    >
                      Next Page
                    </button>
                  </div>
                </div>
              )}
            </div>

            <FloatingPlayer />
          </div>
        )}
      </main>
    </div>
  )
}
