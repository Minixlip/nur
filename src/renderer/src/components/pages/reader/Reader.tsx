import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FiChevronLeft, FiGlobe, FiLoader, FiVolume2, FiVolumeX } from 'react-icons/fi'
import {
  TRANSLATION_LANGUAGE_LABELS,
  type TranslationTargetLanguage
} from '../../../../../shared/translation'
import { useAudioPlayer } from '../../../hooks/useAudioPlayer'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useLibrary, SavedBook } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import { useTextPreviewPlayer } from '../../../hooks/useTextPreviewPlayer'
import {
  extractPageTextForTranslation,
  splitTranslatedParagraphs,
  splitTranslatedSentenceBlocks
} from '../../../utils/pageTranslation'
import AppearanceMenu from '../../AppearanceMenu'
import { BookViewer } from '../../bookViewer'
import { TableOfContents } from '../../TableOfContents'
import { ReaderPlayer } from './ReaderPlayer'
import { getPlayerTheme, getReaderTheme } from './readerThemes'

type TranslationViewMode = 'original' | 'translated'

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
  const [translationLanguage, setTranslationLanguage] = useState<TranslationTargetLanguage>('es')
  const [translationMode, setTranslationMode] = useState<TranslationViewMode>('original')
  const [translationLoading, setTranslationLoading] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [translationCache, setTranslationCache] = useState<Record<string, string>>({})

  const { totalPages, isLoading, error, loadBookByPath, bookStructure } = useBookImporter()

  const { isPlaying, isPaused, globalSentenceIndex, status, buffering, play, pause, stop } =
    useAudioPlayer({
      bookStructure,
      visualPageIndex
    })

  const handleBeforeTranslatedAudioPlay = useCallback(async (): Promise<void> => {
    await stop()
  }, [stop])

  const {
    isGenerating: isGeneratingTranslatedAudio,
    isPlaying: isPlayingTranslatedAudio,
    activeSentenceIndex: activeTranslatedSentenceIndex,
    error: translatedAudioError,
    playText: playTranslatedText,
    stop: stopTranslatedAudio,
    clearError: clearTranslatedAudioError
  } = useTextPreviewPlayer({
    onBeforePlay: handleBeforeTranslatedAudioPlay
  })

  const lastLoadedIdRef = useRef<string | null>(null)
  const initializedPageRef = useRef(false)
  const lastProgressPageRef = useRef<number | null>(null)
  const lastProgressAnchorRef = useRef<number | null>(null)
  const progressTimeoutRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pendingJumpRef = useRef<number | null>(null)
  const anchorSentenceRef = useRef<number | null>(null)
  const prevPagesStructureRef = useRef<typeof bookStructure.pagesStructure | null>(null)
  const prevVisualPageRef = useRef<number | null>(null)
  const activeBookIdRef = useRef<string | null>(null)
  const restoredAnchorBookIdRef = useRef<string | null>(null)
  const currentPageBlocks = useMemo(
    () => bookStructure.pagesStructure?.[visualPageIndex] ?? [],
    [bookStructure.pagesStructure, visualPageIndex]
  )
  const currentPageText = useMemo(
    () => extractPageTextForTranslation(currentPageBlocks),
    [currentPageBlocks]
  )
  const translationCacheKey = useMemo(() => {
    if (!activeBook?.id) return ''
    return `${activeBook.id}:${visualPageIndex}:${translationLanguage}`
  }, [activeBook?.id, translationLanguage, visualPageIndex])
  const translatedText = translationCacheKey ? (translationCache[translationCacheKey] ?? '') : ''
  const translatedParagraphs = useMemo(
    () => splitTranslatedParagraphs(translatedText),
    [translatedText]
  )
  const translatedSentenceBlocks = useMemo(
    () => splitTranslatedSentenceBlocks(translatedText, translationLanguage),
    [translatedText, translationLanguage]
  )
  const translatedSentences = useMemo(
    () => translatedSentenceBlocks.reduce<string[]>((all, block) => all.concat(block), []),
    [translatedSentenceBlocks]
  )
  const hasCurrentTranslation = translatedParagraphs.length > 0
  const selectedTranslationLabel = TRANSLATION_LANGUAGE_LABELS[translationLanguage]
  const showTranslatedText = translationMode === 'translated' && hasCurrentTranslation
  const getAnchorIndexForPage = useCallback(
    (pageIndex: number): number | null => {
      const pageBlocks = bookStructure.pagesStructure?.[pageIndex]
      if (!pageBlocks || pageBlocks.length === 0) return null
      for (const block of pageBlocks) {
        if (typeof block.startIndex === 'number') {
          return block.startIndex
        }
      }
      return null
    },
    [bookStructure.pagesStructure]
  )
  const handleNextPage = useCallback((): void => {
    void stopTranslatedAudio()
    setVisualPageIndex((p) => Math.min(totalPages - 1, p + 1))
  }, [stopTranslatedAudio, totalPages])

  const handlePrevPage = useCallback((): void => {
    void stopTranslatedAudio()
    setVisualPageIndex((p) => Math.max(0, p - 1))
  }, [stopTranslatedAudio])

  const handleChapterClick = useCallback(
    (pageIndex: number): void => {
      void stopTranslatedAudio()
      setVisualPageIndex(pageIndex)
    },
    [stopTranslatedAudio]
  )

  useEffect(() => {
    const updateCompact = (): void => setIsCompactHeight(window.innerHeight < 620)
    updateCompact()
    window.addEventListener('resize', updateCompact)
    return () => window.removeEventListener('resize', updateCompact)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName

      if (target?.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA') return

      if (event.key === 'Escape') {
        if (isAppearanceOpen) {
          setIsAppearanceOpen(false)
          return
        }
        if (isTocOpen) {
          setIsTocOpen(false)
        }
        return
      }

      if (isAppearanceOpen || isTocOpen) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePrevPage()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleNextPage()
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void stopTranslatedAudio()
        if (translationMode === 'translated') {
          setTranslationMode('original')
        }
        if (isPlaying) {
          void (isPaused ? play() : pause())
          return
        }
        void play()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleNextPage,
    handlePrevPage,
    isAppearanceOpen,
    isPaused,
    isPlaying,
    isTocOpen,
    pause,
    play,
    stopTranslatedAudio,
    totalPages,
    translationMode,
    visualPageIndex
  ])

  useEffect(() => {
    if (!bookId || loadingLibrary) return

    const book = library.find((item) => item.id === bookId) || null
    setActiveBook(book)

    if (!book) return
    if (!initializedPageRef.current || lastLoadedIdRef.current !== book.id) {
      const savedIndex = book.lastPageIndex ?? 0
      lastProgressPageRef.current = savedIndex
      lastProgressAnchorRef.current = book.lastAnchorSentenceIndex ?? null
      anchorSentenceRef.current = book.lastAnchorSentenceIndex ?? null
      restoredAnchorBookIdRef.current = null
      setVisualPageIndex(savedIndex)
      initializedPageRef.current = true
    }

    if (lastLoadedIdRef.current !== book.id) {
      lastLoadedIdRef.current = book.id
      loadBookByPath(book.path)
    }
  }, [bookId, library, loadingLibrary, loadBookByPath])

  useEffect(() => {
    if (activeBookIdRef.current !== activeBook?.id) {
      activeBookIdRef.current = activeBook?.id ?? null
      anchorSentenceRef.current = null
      prevPagesStructureRef.current = null
      restoredAnchorBookIdRef.current = null
    }
  }, [activeBook?.id])

  useEffect(() => {
    if (!activeBook) return
    if (isLoading) return
    if (
      typeof activeBook.lastAnchorSentenceIndex === 'number' &&
      restoredAnchorBookIdRef.current !== activeBook.id
    ) {
      return
    }

    const anchorIndex = anchorSentenceRef.current ?? getAnchorIndexForPage(visualPageIndex)
    if (
      lastProgressPageRef.current === visualPageIndex &&
      lastProgressAnchorRef.current === anchorIndex
    ) {
      return
    }

    if (progressTimeoutRef.current) {
      window.clearTimeout(progressTimeoutRef.current)
    }

    progressTimeoutRef.current = window.setTimeout(() => {
      lastProgressPageRef.current = visualPageIndex
      lastProgressAnchorRef.current = anchorIndex
      updateProgress(
        activeBook.id,
        visualPageIndex,
        totalPages || undefined,
        anchorIndex ?? undefined
      )
    }, 300)

    return () => {
      if (progressTimeoutRef.current) {
        window.clearTimeout(progressTimeoutRef.current)
      }
    }
  }, [
    activeBook,
    getAnchorIndexForPage,
    isLoading,
    updateProgress,
    visualPageIndex,
    totalPages,
    bookStructure.pagesStructure
  ])

  useEffect(() => {
    if (!activeBook || isLoading) return
    if (anchorSentenceRef.current !== null) return
    const anchor = getAnchorIndexForPage(visualPageIndex)
    if (anchor !== null) {
      anchorSentenceRef.current = anchor
    }
  }, [
    activeBook,
    getAnchorIndexForPage,
    isLoading,
    visualPageIndex,
    bookStructure.pagesStructure.length
  ])

  useEffect(() => {
    if (!activeBook || isLoading) return
    if (restoredAnchorBookIdRef.current === activeBook.id) return

    restoredAnchorBookIdRef.current = activeBook.id
    const savedAnchor = activeBook.lastAnchorSentenceIndex
    if (typeof savedAnchor !== 'number') return

    anchorSentenceRef.current = savedAnchor
    const mappedPage = bookStructure.sentenceToPageMap[savedAnchor]
    if (typeof mappedPage === 'number' && mappedPage !== visualPageIndex) {
      setVisualPageIndex(mappedPage)
    }
  }, [activeBook, isLoading, visualPageIndex, bookStructure.sentenceToPageMap])

  useEffect(() => {
    if (!activeBook || isLoading) return
    if (prevPagesStructureRef.current === null) {
      prevPagesStructureRef.current = bookStructure.pagesStructure
      return
    }
    if (prevPagesStructureRef.current === bookStructure.pagesStructure) return

    prevPagesStructureRef.current = bookStructure.pagesStructure
    const anchor = anchorSentenceRef.current
    if (anchor === null) return
    const mappedPage = bookStructure.sentenceToPageMap[anchor]
    if (typeof mappedPage === 'number' && mappedPage !== visualPageIndex) {
      setVisualPageIndex(mappedPage)
    }
  }, [
    activeBook,
    isLoading,
    bookStructure.pagesStructure,
    bookStructure.sentenceToPageMap,
    visualPageIndex
  ])

  useEffect(() => {
    if (!activeBook || isLoading) return
    const anchor = getAnchorIndexForPage(visualPageIndex)
    if (anchor !== null) {
      anchorSentenceRef.current = anchor
    }
  }, [
    activeBook,
    getAnchorIndexForPage,
    globalSentenceIndex,
    isLoading,
    visualPageIndex,
    bookStructure.pagesStructure
  ])

  useEffect(() => {
    setTranslationError(null)
    clearTranslatedAudioError()
    void stopTranslatedAudio()
  }, [
    activeBook?.id,
    clearTranslatedAudioError,
    stopTranslatedAudio,
    translationLanguage,
    visualPageIndex
  ])

  useEffect(() => {
    if (translationMode === 'translated' && !hasCurrentTranslation) {
      setTranslationMode('original')
    }
  }, [hasCurrentTranslation, translationMode])

  useEffect(() => {
    if (!isPlaying || isPaused) return
    if (globalSentenceIndex < 0) return

    const targetPage = bookStructure.sentenceToPageMap[globalSentenceIndex]
    if (typeof targetPage !== 'number') return
    if (targetPage <= visualPageIndex) return

    setVisualPageIndex(targetPage)
  }, [isPlaying, isPaused, globalSentenceIndex, visualPageIndex, bookStructure.sentenceToPageMap])

  useEffect(() => {
    const previousPage = prevVisualPageRef.current
    prevVisualPageRef.current = visualPageIndex

    if (previousPage === null || previousPage === visualPageIndex) return
    if (pendingJumpRef.current !== null) return

    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [visualPageIndex])

  const handleTranslatePage = useCallback(async (): Promise<void> => {
    const text = currentPageText.trim()
    if (!text) {
      setTranslationError('This page does not contain paragraph text to translate.')
      return
    }
    if (!translationCacheKey) {
      setTranslationError('The active book is not ready for translation yet.')
      return
    }

    clearTranslatedAudioError()
    setTranslationError(null)

    if (translatedText) {
      setTranslationMode('translated')
      return
    }

    setTranslationLoading(true)
    try {
      const result = await window.api.translatePage(text, translationLanguage)
      setTranslationCache((currentCache) => ({
        ...currentCache,
        [translationCacheKey]: result.translatedText
      }))
      setTranslationMode('translated')
    } catch (translationFailure) {
      setTranslationError(
        translationFailure instanceof Error
          ? translationFailure.message
          : 'Translation failed for this page.'
      )
    } finally {
      setTranslationLoading(false)
    }
  }, [
    clearTranslatedAudioError,
    currentPageText,
    translatedText,
    translationCacheKey,
    translationLanguage
  ])

  const handleShowOriginal = useCallback((): void => {
    clearTranslatedAudioError()
    void stopTranslatedAudio()
    setTranslationMode('original')
  }, [clearTranslatedAudioError, stopTranslatedAudio])

  const handleShowTranslated = useCallback(async (): Promise<void> => {
    if (!hasCurrentTranslation) {
      await handleTranslatePage()
      return
    }
    setTranslationError(null)
    setTranslationMode('translated')
  }, [handleTranslatePage, hasCurrentTranslation])

  const handleTranslatedAudioToggle = useCallback(async (): Promise<void> => {
    if (isGeneratingTranslatedAudio) return
    if (isPlayingTranslatedAudio) {
      await stopTranslatedAudio()
      return
    }
    setTranslationMode('translated')
    await playTranslatedText(translatedText, translationLanguage, translatedSentences)
  }, [
    isGeneratingTranslatedAudio,
    isPlayingTranslatedAudio,
    playTranslatedText,
    stopTranslatedAudio,
    translatedSentences,
    translatedText,
    translationLanguage
  ])

  const handleJumpToHighlight = useCallback((): void => {
    if (globalSentenceIndex < 0) return
    const targetPage = bookStructure.sentenceToPageMap[globalSentenceIndex]
    if (targetPage === undefined) return
    pendingJumpRef.current = globalSentenceIndex
    if (targetPage !== visualPageIndex) {
      setVisualPageIndex(targetPage)
    }
  }, [bookStructure.sentenceToPageMap, globalSentenceIndex, visualPageIndex])

  useEffect(() => {
    const targetSentence = pendingJumpRef.current
    if (targetSentence === null) return
    const container = scrollContainerRef.current
    const scope = container ?? document
    const current = scope.querySelector('[data-current-sentence="true"]') as HTMLElement | null
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

  const playerTheme = getPlayerTheme(settings.theme)
  const readerTheme = getReaderTheme(settings.theme)
  const shouldShowPlayer = Boolean(activeBook) && !isTocOpen && !isAppearanceOpen
  const controlTheme =
    settings.theme === 'dark'
      ? {
          input: 'border-white/10 bg-white/[0.04] text-zinc-100',
          button: 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]',
          buttonActive: 'border-emerald-300/30 bg-emerald-400/12 text-emerald-100',
          buttonPrimary: 'border-emerald-300/20 bg-emerald-300 text-zinc-950 hover:bg-emerald-200',
          buttonMuted: 'border-white/10 bg-transparent text-zinc-500',
          status: 'text-zinc-400',
          error: 'text-rose-300'
        }
      : settings.theme === 'sepia'
        ? {
            input: 'border-black/10 bg-black/[0.04] text-[#3b2f1f]',
            button: 'border-black/10 bg-black/[0.04] text-[#3b2f1f] hover:bg-black/[0.08]',
            buttonActive: 'border-emerald-700/20 bg-emerald-700/10 text-emerald-900',
            buttonPrimary: 'border-[#3b2f1f]/10 bg-[#3b2f1f] text-[#f4ecd8] hover:bg-[#2f2619]',
            buttonMuted: 'border-black/10 bg-transparent text-[#8a7763]',
            status: 'text-[#6b5844]',
            error: 'text-rose-700'
          }
        : {
            input: 'border-black/10 bg-black/[0.03] text-zinc-800',
            button: 'border-black/10 bg-black/[0.03] text-zinc-800 hover:bg-black/[0.06]',
            buttonActive: 'border-emerald-700/20 bg-emerald-700/8 text-emerald-800',
            buttonPrimary: 'border-zinc-900/10 bg-zinc-900 text-white hover:bg-zinc-800',
            buttonMuted: 'border-black/10 bg-transparent text-zinc-400',
            status: 'text-zinc-600',
            error: 'text-rose-700'
          }

  const pagePercent = totalPages > 0 ? ((visualPageIndex + 1) / totalPages) * 100 : 0
  const handlePrimaryPlayerAction = async (): Promise<void> => {
    await stopTranslatedAudio()

    if (translationMode === 'translated') {
      setTranslationMode('original')
    }

    if (buffering.active) {
      await stop()
      return
    }

    if (isPlaying) {
      await (isPaused ? play() : pause())
      return
    }

    await play()
  }

  const player = (
    <ReaderPlayer
      buffering={buffering}
      isPlaying={isPlaying}
      isPaused={isPaused}
      status={status}
      isCompactHeight={isCompactHeight}
      playerTheme={playerTheme}
      progressFillClassName={readerTheme.progressFill}
      canGoPrev={visualPageIndex > 0}
      canGoNext={visualPageIndex < totalPages - 1}
      onPrimaryAction={() => void handlePrimaryPlayerAction()}
      onJumpToHighlight={handleJumpToHighlight}
      onToggleAppearance={() => setIsAppearanceOpen((current) => !current)}
      onToggleToc={() => setIsTocOpen((current) => !current)}
      onPrevPage={handlePrevPage}
      onNextPage={handleNextPage}
      onStop={() => void stop()}
    />
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
        themeMode={settings.theme}
        onChapterClick={handleChapterClick}
      />

      <div
        ref={scrollContainerRef}
        className={`relative flex-1 overflow-y-auto scrollbar-thin transition-colors duration-500 ${
          readerTheme.viewport
        }`}
      >
        <div className={`pointer-events-none absolute inset-0 ${readerTheme.ambient}`} />
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-zinc-500 animate-pulse">
            Opening Book...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-red-400">{error}</div>
        ) : (
          <div
            className={`relative z-10 px-4 pt-4 md:px-8 ${shouldShowPlayer ? 'pb-48' : 'pb-10'}`}
          >
            <div
              className={`sticky top-4 z-20 mx-auto mb-6 max-w-[1180px] rounded-[28px] border backdrop-blur-2xl ${readerTheme.hud}`}
            >
              <div className="flex flex-wrap items-center gap-4 px-5 py-4 md:px-6">
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition hover:bg-white/10"
                >
                  <FiChevronLeft className="text-sm" />
                  <span>Library</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[11px] uppercase tracking-[0.28em] ${readerTheme.eyebrow}`}>
                    Now Reading
                  </div>
                  <div className={`truncate text-lg font-semibold ${readerTheme.title}`}>
                    {activeBook?.title || 'Reader'}
                  </div>
                </div>
                <div className="min-w-32 text-right">
                  <div className={`text-[11px] uppercase tracking-[0.24em] ${readerTheme.eyebrow}`}>
                    Progress
                  </div>
                  <div className={`text-sm font-medium ${readerTheme.meta}`}>
                    Page {visualPageIndex + 1} of {totalPages || 0}
                  </div>
                </div>
              </div>
              <div className={`h-px w-full ${readerTheme.progressTrack}`} />
              <div className="px-5 pb-4 pt-3 md:px-6">
                <div
                  className={`h-1.5 w-full overflow-hidden rounded-full ${readerTheme.progressTrack}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${readerTheme.progressFill}`}
                    style={{ width: `${Math.min(100, Math.max(0, pagePercent))}%` }}
                  />
                </div>
              </div>
              <div className={`h-px w-full ${readerTheme.progressTrack}`} />
              <div className="px-5 pb-5 pt-4 md:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div
                      className={`text-[11px] uppercase tracking-[0.24em] ${readerTheme.eyebrow}`}
                    >
                      Page Translation
                    </div>
                    <label className="flex flex-col gap-2 sm:max-w-60">
                      <span className={`text-xs ${readerTheme.meta}`}>Target language</span>
                      <div className="relative">
                        <FiGlobe
                          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${readerTheme.meta}`}
                        />
                        <select
                          value={translationLanguage}
                          onChange={(event) =>
                            setTranslationLanguage(event.target.value as TranslationTargetLanguage)
                          }
                          disabled={translationLoading}
                          className={`w-full appearance-none rounded-2xl border px-10 py-2.5 text-sm transition outline-none ${controlTheme.input}`}
                        >
                          {(
                            Object.entries(TRANSLATION_LANGUAGE_LABELS) as Array<
                              [TranslationTargetLanguage, string]
                            >
                          ).map(([languageCode, label]) => (
                            <option key={languageCode} value={languageCode}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleTranslatePage()}
                      disabled={translationLoading || !currentPageText.trim()}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${controlTheme.buttonPrimary}`}
                    >
                      {translationLoading ? (
                        <FiLoader className="animate-spin text-sm" />
                      ) : (
                        <FiGlobe className="text-sm" />
                      )}
                      <span>{hasCurrentTranslation ? 'Show translation' : 'Translate page'}</span>
                    </button>
                    <button
                      onClick={handleShowOriginal}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${translationMode === 'original' ? controlTheme.buttonActive : controlTheme.button}`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => void handleShowTranslated()}
                      disabled={
                        translationLoading || (!hasCurrentTranslation && !currentPageText.trim())
                      }
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        translationMode === 'translated' && hasCurrentTranslation
                          ? controlTheme.buttonActive
                          : hasCurrentTranslation
                            ? controlTheme.button
                            : controlTheme.buttonMuted
                      }`}
                    >
                      {selectedTranslationLabel}
                    </button>
                    <button
                      onClick={() => void handleTranslatedAudioToggle()}
                      disabled={translationLoading || !hasCurrentTranslation}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${controlTheme.button}`}
                    >
                      {isGeneratingTranslatedAudio ? (
                        <FiLoader className="animate-spin text-sm" />
                      ) : isPlayingTranslatedAudio ? (
                        <FiVolumeX className="text-sm" />
                      ) : (
                        <FiVolume2 className="text-sm" />
                      )}
                      <span>
                        {isGeneratingTranslatedAudio
                          ? 'Generating audio'
                          : isPlayingTranslatedAudio
                            ? 'Stop translated audio'
                            : 'Play translated audio'}
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${controlTheme.status}`}
                >
                  <span>
                    Viewing{' '}
                    {showTranslatedText
                      ? `${selectedTranslationLabel} translation`
                      : 'original page'}
                  </span>
                  {translationLoading ? (
                    <span>
                      Translating the current page locally. The first run can take longer.
                    </span>
                  ) : null}
                  {!translationLoading && !translationError && hasCurrentTranslation ? (
                    <span>{selectedTranslationLabel} translation is ready for this page.</span>
                  ) : null}
                  {!translationLoading && !translationError && !currentPageText.trim() ? (
                    <span>This page appears to contain images only.</span>
                  ) : null}
                  {translationError ? (
                    <span className={controlTheme.error}>{translationError}</span>
                  ) : null}
                  {translatedAudioError ? (
                    <span className={controlTheme.error}>{translatedAudioError}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={`mx-auto max-w-[1180px] rounded-[34px] border ${readerTheme.surface}`}>
              <div className="px-4 py-8 md:px-6 md:py-10">
                <BookViewer
                  bookStructure={bookStructure}
                  visualPageIndex={visualPageIndex}
                  globalSentenceIndex={globalSentenceIndex}
                  onChapterClick={handleChapterClick}
                  settings={settings}
                  translatedParagraphs={translatedParagraphs}
                  translatedSentenceBlocks={translatedSentenceBlocks}
                  activeTranslatedSentenceIndex={activeTranslatedSentenceIndex}
                  showTranslatedText={showTranslatedText}
                  translatedLanguageLabel={selectedTranslationLabel}
                  translatedIsRtl={translationLanguage === 'ar'}
                />
              </div>
            </div>

            <div className={`mt-8 pb-10 text-center text-xs ${readerTheme.meta}`}>
              Page {visualPageIndex + 1} of {totalPages}
            </div>
            {shouldShowPlayer && isCompactHeight ? player : null}
          </div>
        )}
      </div>

      {shouldShowPlayer && !isCompactHeight ? player : null}
    </div>
  )
}
