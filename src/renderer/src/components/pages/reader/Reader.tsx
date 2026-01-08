import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useLibrary, SavedBook } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import AppearanceMenu from '../../AppearanceMenu'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'

type ReaderProps = {
  onToggleSidebar: () => void
}

export default function Reader({ onToggleSidebar }: ReaderProps): React.JSX.Element {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const { library, loadingLibrary, updateProgress } = useLibrary()
  const { settings, updateSetting } = useReaderSettings()

  const [activeBook, setActiveBook] = useState<SavedBook | null>(null)
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)

  const { totalPages, isLoading, error, loadBookByPath, bookStructure } = useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!bookId || loadingLibrary) return

    const book = library.find((item) => item.id === bookId) || null
    setActiveBook(book)

    if (!book) return

    setVisualPageIndex(book.lastPageIndex || 0)

    if (lastLoadedIdRef.current !== book.id) {
      lastLoadedIdRef.current = book.id
      loadBookByPath(book.path)
    }
  }, [bookId, library, loadingLibrary, loadBookByPath])

  const handleNextPage = () => {
    setVisualPageIndex((p) => {
      const newPage = Math.min(totalPages - 1, p + 1)
      if (activeBook) updateProgress(activeBook.id, newPage)
      return newPage
    })
  }

  const handlePrevPage = () => {
    setVisualPageIndex((p) => {
      const newPage = Math.max(0, p - 1)
      if (activeBook) updateProgress(activeBook.id, newPage)
      return newPage
    })
  }

  const handleChapterClick = (pageIndex: number) => {
    setVisualPageIndex(pageIndex)
    if (activeBook) updateProgress(activeBook.id, pageIndex)
  }

  if (!bookId) {
    return (
      <div className="p-8 text-zinc-300">
        <p>No book selected.</p>
      </div>
    )
  }

  if (!loadingLibrary && !activeBook) {
    return (
      <div className="p-8 text-zinc-300">
        <p>Book not found.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-white/90 text-black rounded-lg shadow"
        >
          Back to Library
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-40 pointer-events-none">
        <button
          onClick={onToggleSidebar}
          className="pointer-events-auto w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-zinc-200 hover:text-white hover:bg-white/20 transition shadow-lg"
          aria-label="Toggle sidebar"
        >
          Menu
        </button>

        <div className="pointer-events-auto flex gap-2">
          <div className="relative">
            <button
              onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-zinc-200 hover:text-white hover:bg-white/20 transition shadow-lg"
              aria-label="Open appearance settings"
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
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-zinc-200 hover:text-white hover:bg-white/20 transition shadow-lg"
            aria-label="Toggle table of contents"
          >
            TOC
          </button>
        </div>
      </div>

      <TableOfContents
        items={bookStructure.processedToc || []}
        isOpen={isTocOpen}
        onClose={() => setIsTocOpen(false)}
        currentVisualPage={visualPageIndex}
        onChapterClick={handleChapterClick}
      />

      <div
        className={`flex-1 overflow-y-auto scrollbar-thin transition-colors duration-500 ${
          settings.theme === 'light'
            ? 'bg-[#fcfbf9]'
            : settings.theme === 'sepia'
              ? 'bg-[#f4ecd8]'
              : 'bg-[#141416]'
        }`}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-zinc-500 animate-pulse">
            Opening Book...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-red-400">{error}</div>
        ) : (
          <div className="pt-20 pb-48 px-4 md:px-0">
            <BookViewer
              bookStructure={bookStructure}
              visualPageIndex={visualPageIndex}
              globalSentenceIndex={globalSentenceIndex}
              isPlaying={isPlaying}
              onChapterClick={handleChapterClick}
              settings={settings}
            />
            <div
              className={`flex justify-center items-center gap-8 mt-10 pb-10 opacity-60 hover:opacity-100 transition-opacity ${
                settings.theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}
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

      {activeBook && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4">
          <div className="w-full max-w-[720px] bg-white/10 backdrop-blur-2xl border border-white/20 pl-4 pr-6 py-3 rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex items-center gap-4 transition-all hover:bg-white/15">
            <button
              onClick={isPlaying ? (isPaused ? play : pause) : play}
              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-zinc-200 transition active:scale-95"
              aria-label={isPlaying && !isPaused ? 'Pause playback' : 'Start playback'}
            >
              {isPlaying && !isPaused ? <span className="text-xl font-bold">Pause</span> : null}
              {!isPlaying || isPaused ? <span className="text-xl font-bold">Play</span> : null}
            </button>

            <div className="flex flex-col gap-1 flex-1 min-w-[120px] max-w-[220px]">
              <div className="h-8 flex items-center gap-1 opacity-50">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 bg-white rounded-full transition-all duration-300 ${
                      isPlaying && !isPaused ? 'animate-pulse' : ''
                    }`}
                    style={{ height: `${Math.random() * 20 + 8}px` }}
                  ></div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 border-l border-white/10 pl-4">
              <div className="text-xs">
                <div className="text-zinc-400">Status</div>
                <div className="text-emerald-400 font-mono">{status}</div>
              </div>

              <button
                onClick={stop}
                className="text-zinc-400 hover:text-red-400 transition"
                aria-label="Stop playback"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
