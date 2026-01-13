import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FiList,
  FiSliders,
  FiChevronLeft,
  FiChevronRight,
  FiPlay,
  FiPause,
  FiStopCircle,
  FiCrosshair
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
  const initializedPageRef = useRef(false)
  const lastProgressPageRef = useRef<number | null>(null)
  const progressTimeoutRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pendingJumpRef = useRef<number | null>(null)

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
    if (!initializedPageRef.current || lastLoadedIdRef.current !== book.id) {
      setVisualPageIndex(book.lastPageIndex || 0)
      initializedPageRef.current = true
    }

    if (lastLoadedIdRef.current !== book.id) {
      lastLoadedIdRef.current = book.id
      loadBookByPath(book.path)
    }
  }, [bookId, library, loadingLibrary, loadBookByPath])

  useEffect(() => {
    if (!activeBook) return
    if (lastProgressPageRef.current === visualPageIndex) return

    if (progressTimeoutRef.current) {
      window.clearTimeout(progressTimeoutRef.current)
    }

    progressTimeoutRef.current = window.setTimeout(() => {
      lastProgressPageRef.current = visualPageIndex
      updateProgress(activeBook.id, visualPageIndex)
    }, 300)

    return () => {
      if (progressTimeoutRef.current) {
        window.clearTimeout(progressTimeoutRef.current)
      }
    }
  }, [activeBook, updateProgress, visualPageIndex])

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

  const handleJumpToHighlight = () => {
    if (globalSentenceIndex < 0) return
    const targetPage = bookStructure.sentenceToPageMap[globalSentenceIndex]
    if (targetPage === undefined) return
    pendingJumpRef.current = globalSentenceIndex
    if (targetPage !== visualPageIndex) {
      setVisualPageIndex(targetPage)
    }
  }

  useEffect(() => {
    const targetSentence = pendingJumpRef.current
    if (targetSentence === null) return
    const container = scrollContainerRef.current
    const scope = container ?? document
    const current = scope.querySelector('[data-current-sentence="true"]') as
      | HTMLElement
      | null
    if (current) {
      current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      pendingJumpRef.current = null
    }
  }, [visualPageIndex, globalSentenceIndex])

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

  const playerTheme =
    settings.theme === 'light'
      ? {
          shell: 'bg-white/95 text-zinc-900 border-black/10',
          button: 'bg-zinc-900 text-white hover:bg-zinc-800',
          iconButton: 'border-black/10 bg-black/5 text-zinc-700 hover:bg-black/10',
          statusLabel: 'text-zinc-500',
          statusValue: 'text-emerald-600',
          separator: 'border-black/10',
          wave: 'bg-zinc-700'
        }
      : settings.theme === 'sepia'
        ? {
            shell: 'bg-[#f1e8d5]/95 text-[#3b2f1f] border-black/10',
            button: 'bg-[#3b2f1f] text-[#f4ecd8] hover:bg-[#2f2619]',
            iconButton: 'border-black/10 bg-black/5 text-[#3b2f1f] hover:bg-black/10',
            statusLabel: 'text-[#6a5a4a]',
            statusValue: 'text-emerald-700',
            separator: 'border-black/10',
            wave: 'bg-[#3b2f1f]'
          }
        : {
            shell: 'bg-white/10 text-zinc-100 border-white/20',
            button: 'bg-white text-black hover:bg-zinc-200',
            iconButton: 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10',
            statusLabel: 'text-zinc-400',
            statusValue: 'text-emerald-400',
            separator: 'border-white/10',
            wave: 'bg-white'
          }

  const player = (
    <div
      className={`${
        isCompactHeight ? 'sticky bottom-4' : 'fixed bottom-6'
      } inset-x-0 z-50 flex justify-center px-4`}
    >
      <div
        className={`w-full max-w-[720px] backdrop-blur-2xl border shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-all ${playerTheme.shell} ${
          isCompactHeight
            ? 'rounded-2xl px-4 py-2 flex items-center gap-3'
            : 'rounded-full pl-4 pr-6 py-3 flex items-center gap-4'
        }`}
      >
        <button
          onClick={isPlaying ? (isPaused ? play : pause) : play}
          className={`rounded-full flex items-center justify-center shadow-lg transition active:scale-95 ${playerTheme.button} ${
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
                className={`w-1 ${playerTheme.wave} rounded-full transition-all duration-300 ${
                  isPlaying && !isPaused ? 'animate-pulse' : ''
                }`}
                style={{ height: `${Math.random() * 20 + 8}px` }}
              ></div>
            ))}
          </div>
        </div>

        <div
          className={`flex items-center gap-3 ${
            isCompactHeight
              ? `border-l pl-3 ${playerTheme.separator}`
              : `border-l pl-4 ${playerTheme.separator}`
          }`}
        >
          <div className="text-xs">
            <div className={playerTheme.statusLabel}>Status</div>
            <div className={`font-mono ${playerTheme.statusValue}`}>{status}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleJumpToHighlight}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center ${playerTheme.iconButton}`}
            aria-label="Jump to current highlighted passage"
          >
            <FiCrosshair className="text-sm" />
          </button>
          <button
            onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center ${playerTheme.iconButton}`}
            aria-label="Open appearance settings"
          >
            <FiSliders className="text-sm" />
          </button>
          <button
            onClick={() => setIsTocOpen(!isTocOpen)}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center ${playerTheme.iconButton}`}
            aria-label="Toggle table of contents"
          >
            <FiList className="text-sm" />
          </button>
          <button
            onClick={handlePrevPage}
            disabled={visualPageIndex === 0}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center disabled:opacity-40 ${playerTheme.iconButton}`}
            aria-label="Previous page"
          >
            <FiChevronLeft className="text-sm" />
          </button>
          <button
            onClick={handleNextPage}
            disabled={visualPageIndex >= totalPages - 1}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center disabled:opacity-40 ${playerTheme.iconButton}`}
            aria-label="Next page"
          >
            <FiChevronRight className="text-sm" />
          </button>
          <button
            onClick={stop}
            className={`h-9 w-9 rounded-full border transition flex items-center justify-center ${playerTheme.iconButton}`}
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
        ref={scrollContainerRef}
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
