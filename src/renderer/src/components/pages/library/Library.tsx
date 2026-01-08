import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useLibrary } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import type { SavedBook } from '@renderer/env'

export type LibraryOutletContext = {
  library: SavedBook[]
  loadingLibrary: boolean
  addToLibrary: (filePath: string, title: string, cover: string | null) => Promise<SavedBook | null>
  removeBook: (id: string, e: React.MouseEvent) => Promise<void>
  updateProgress: (bookId: string, pageIndex: number) => Promise<void>
  activeBookId: string | null
  visualPageIndex: number
  totalPages: number
  isLoading: boolean
  error: string | null
  bookStructure: ReturnType<typeof useBookImporter>['bookStructure']
  settings: ReturnType<typeof useReaderSettings>['settings']
  updateSetting: ReturnType<typeof useReaderSettings>['updateSetting']
  isTocOpen: boolean
  setIsTocOpen: (value: boolean) => void
  isAppearanceOpen: boolean
  setIsAppearanceOpen: (value: boolean) => void
  globalSentenceIndex: number
  isPlaying: boolean
  isPaused: boolean
  status: string
  play: () => void
  pause: () => void
  stop: () => void
  handleNextPage: () => void
  handlePrevPage: () => void
  handleChapterClick: (pageIndex: number) => void
  handleImportNew: () => Promise<void>
  openBook: (book: SavedBook) => Promise<void>
  loadBookById: (bookId: string) => Promise<boolean>
  goBackToShelf: () => void
}

export default function LibraryLayout(): React.JSX.Element {
  const navigate = useNavigate()
  const { library, loadingLibrary, addToLibrary, removeBook, updateProgress } = useLibrary()
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const libraryRef = useRef(library)
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
  const { settings, updateSetting } = useReaderSettings()

  const { totalPages, isLoading, error, importBook, loadBookByPath, bookStructure } =
    useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, play, pause, stop } = useAudioPlayer({
    bookStructure,
    visualPageIndex,
    setVisualPageIndex
  })

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

  useEffect(() => {
    libraryRef.current = library
  }, [library])

  const loadBookById = useCallback(
    async (bookId: string) => {
      const book = libraryRef.current.find((item) => item.id === bookId)
      if (!book) return false
      setActiveBookId(book.id)
      setVisualPageIndex(book.lastPageIndex || 0)
      setIsTocOpen(false)
      await loadBookByPath(book.path)
      return true
    },
    [loadBookByPath]
  )

  const openBook = async (book: SavedBook) => {
    await loadBookById(book.id)
    navigate(`/reader/${book.id}`)
  }

  const handleImportNew = async () => {
    const bookData = await importBook(true)
    if (bookData) {
      const savedBook = await addToLibrary(bookData.filePath, bookData.title, bookData.cover || null)
      setVisualPageIndex(0)
      setIsTocOpen(false)
      if (savedBook) {
        navigate(`/reader/${savedBook.id}`)
        await loadBookByPath(savedBook.path)
        setActiveBookId(savedBook.id)
      }
    }
  }

  const goBackToShelf = () => {
    stop()
    setActiveBookId(null)
    navigate('/')
  }

  const outletContext: LibraryOutletContext = {
    library,
    loadingLibrary,
    addToLibrary,
    removeBook,
    updateProgress,
    activeBookId,
    visualPageIndex,
    totalPages,
    isLoading,
    error,
    bookStructure,
    settings,
    updateSetting,
    isTocOpen,
    setIsTocOpen,
    isAppearanceOpen,
    setIsAppearanceOpen,
    globalSentenceIndex,
    isPlaying,
    isPaused,
    status,
    play,
    pause,
    stop,
    handleNextPage,
    handlePrevPage,
    handleChapterClick,
    handleImportNew,
    openBook,
    loadBookById,
    goBackToShelf
  }

  const navButtonClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
      isActive
        ? 'bg-white/10 text-white shadow-inner'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
    }`

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      <aside className="w-64 flex-shrink-0 bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col p-4 gap-6 z-20">
        <div className="flex gap-2 px-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
        </div>

        <nav className="flex flex-col gap-2 mt-4">
          <NavLink to="/" end className={navButtonClass}>
            <span className="text-lg">📚</span> My Library
          </NavLink>
          <NavLink to="/settings" className={navButtonClass}>
            <span className="text-lg">⚙️</span> Settings
          </NavLink>
        </nav>

        <div className="mt-auto">
          <h4 className="px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Recent Reads
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {library.slice(0, 3).map((book) => (
              <button
                key={book.id}
                onClick={() => openBook(book)}
                className="w-12 h-16 bg-zinc-800 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition flex-shrink-0 border border-white/10"
              >
                {book.cover ? (
                  <img src={book.cover} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs">📖</div>
                )}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
        <Outlet context={outletContext} />
      </main>
    </div>
  )
}
