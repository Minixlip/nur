import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FiList,
  FiSliders,
  FiChevronLeft,
  FiChevronRight,
  FiPlay,
  FiPause,
  FiStopCircle
} from 'react-icons/fi'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useLibrary, SavedBook } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import AppearanceMenu from '../../AppearanceMenu'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'

export default function Reader(): React.JSX.Element {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const { library, loadingLibrary, updateProgress } = useLibrary()
  const { settings, updateSetting } = useReaderSettings()

  const [activeBook, setActiveBook] = useState<SavedBook | null>(null)
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
  const [isCompactHeight, setIsCompactHeight] = useState(false)

  const { totalPages, isLoading, error, loadBookByPath, bookStructure } = useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

  const lastLoadedIdRef = useRef<string | null>(null)

  useEffect(() => {
    const updateCompact = () => setIsCompactHeight(window.innerHeight < 620)
    updateCompact()
    window.addEventListener('resize', updateCompact)
    return () => window.removeEventListener('resize', updateCompact)
  }, [])

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

  const player = (
    <div
      className={`${
        isCompactHeight ? 'sticky bottom-4' : 'fixed bottom-6'
      } inset-x-0 z-50 flex justify-center px-4`}
    >
      <div
        className={`w-full max-w-[720px] bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-all hover:bg-white/15 ${
          isCompactHeight
            ? 'rounded-2xl px-4 py-2 flex items-center gap-3'
            : 'rounded-full pl-4 pr-6 py-3 flex items-center gap-4'
        }`}
      >
        <button
          onClick={isPlaying ? (isPaused ? play : pause) : play}
          className={`rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-zinc-200 transition active:scale-95 ${
            isCompactHeight ? 'w-10 h-10' : 'w-12 h-12'
          }`}
          aria-label={isPlaying && !isPaused ? 'Pause playback' : 'Start playback'}
          aria-pressed={isPlaying && !isPaused}
        >
          {isPlaying && !isPaused ? (
            <FiPause className={isCompactHeight ? 'text-base' : 'text-xl'} />
          ) : (
            <FiPlay className={isCompactHeight ? 'text-base' : 'text-xl'} />
          )}
        </button>

        <div
          className={`flex flex-col gap-1 flex-1 min-w-[120px] ${
            isCompactHeight ? 'max-w-[160px]' : 'max-w-[220px]'
          }`}
        >
          <div className="h-6 flex items-center gap-1 opacity-50">
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

        <div
          className={`flex items-center gap-3 ${
            isCompactHeight ? 'border-l border-white/10 pl-3' : 'border-l border-white/10 pl-4'
          }`}
        >
          <div className="text-xs">
            <div className="text-zinc-400">Status</div>
            <div className="text-emerald-400 font-mono">{status}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition flex items-center justify-center"
            aria-label="Open appearance settings"
          >
            <FiSliders className="text-sm" />
          </button>
          <button
            onClick={() => setIsTocOpen(!isTocOpen)}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition flex items-center justify-center"
            aria-label="Toggle table of contents"
          >
            <FiList className="text-sm" />
          </button>
          <button
            onClick={handlePrevPage}
            disabled={visualPageIndex === 0}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-40"
            aria-label="Previous page"
          >
            <FiChevronLeft className="text-sm" />
          </button>
          <button
            onClick={handleNextPage}
            disabled={visualPageIndex >= totalPages - 1}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-40"
            aria-label="Next page"
          >
            <FiChevronRight className="text-sm" />
          </button>
          <button
            onClick={stop}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-red-400 hover:bg-white/10 transition flex items-center justify-center"
            aria-label="Stop playback"
          >
            <FiStopCircle className="text-sm" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <AppearanceMenu
        isOpen={isAppearanceOpen}
        onClose={() => setIsAppearanceOpen(false)}
        settings={settings}
        updateSetting={updateSetting}
      />

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
          <div className="pt-20 pb-48 px-0">
            <BookViewer
              bookStructure={bookStructure}
              visualPageIndex={visualPageIndex}
              globalSentenceIndex={globalSentenceIndex}
              isPlaying={isPlaying}
              onChapterClick={handleChapterClick}
              settings={settings}
            />
            <div className="mt-10 pb-10 text-center text-xs text-zinc-500">
              Page {visualPageIndex + 1} of {totalPages}
            </div>
            {activeBook && isCompactHeight ? player : null}
          </div>
        )}
      </div>

      {activeBook && !isCompactHeight ? player : null}
    </div>
  )
}
