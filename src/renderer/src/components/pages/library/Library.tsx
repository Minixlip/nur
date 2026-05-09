import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiLoader, FiPlus, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useLibrary, SavedBook } from '../../../hooks/useLibrary'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import { getAppTheme } from '../../../theme/appTheme'
import { extractBookTextForSummary } from '../../../utils/epubSummary'
import Tooltip from '../../ui/Tooltip'

export default function Library(): React.JSX.Element {
  const navigate = useNavigate()
  const { library, addToLibrary, removeBook, updateSummary } = useLibrary()
  const { importBook } = useBookImporter()
  const { settings } = useReaderSettings()
  const theme = getAppTheme(settings.theme)
  const [search, setSearch] = useState('')
  const [summarizingBookId, setSummarizingBookId] = useState<string | null>(null)
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({})
  const [selectedSummaryBookId, setSelectedSummaryBookId] = useState<string | null>(null)

  const handleImportNew = async () => {
    const bookData = await importBook(true)
    if (!bookData) return

    const savedBook = await addToLibrary(bookData.filePath, bookData.title, bookData.cover || null)
    if (savedBook?.id) {
      navigate(`/read/${savedBook.id}`)
    }
  }

  const openBook = (book: SavedBook) => {
    navigate(`/read/${book.id}`)
  }

  const selectedSummaryBook = useMemo(
    () => library.find((book) => book.id === selectedSummaryBookId) ?? null,
    [library, selectedSummaryBookId]
  )

  const handleGenerateSummary = async (book: SavedBook, event: React.MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()

    if (summarizingBookId) return

    setSummarizingBookId(book.id)
    setSummaryErrors((current) => {
      const next = { ...current }
      delete next[book.id]
      return next
    })

    try {
      const fileBuffer = await window.api.readFile(book.path)
      const rawData = new Uint8Array(fileBuffer)
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer

      const extracted = await extractBookTextForSummary(cleanBuffer)
      if (!extracted.text.trim()) {
        throw new Error('Could not extract readable book text for summarisation.')
      }

      const result = await window.api.summarizeBook(extracted.text, extracted.title || book.title)
      await updateSummary(book.id, result.summary, result.generatedAt, result.model)
    } catch (error) {
      setSummaryErrors((current) => ({
        ...current,
        [book.id]:
          error instanceof Error
            ? error.message
            : 'Could not generate a local summary for this book.'
      }))
    } finally {
      setSummarizingBookId((current) => (current === book.id ? null : current))
    }
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredLibrary = normalizedSearch
    ? library.filter((book) => book.title.toLowerCase().includes(normalizedSearch))
    : library

  const totalBooks = library.length
  const resumedBooks = library.filter(
    (book) => typeof book.lastPageIndex === 'number' && book.lastPageIndex > 0
  ).length
  const finishedBooks = library.filter(
    (book) =>
      typeof book.lastPageIndex === 'number' &&
      typeof book.totalPages === 'number' &&
      book.totalPages > 0 &&
      book.lastPageIndex + 1 >= book.totalPages
  ).length

  useEffect(() => {
    if (!selectedSummaryBookId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSummaryBookId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSummaryBookId])

  return (
    <div className={`h-full overflow-y-auto px-5 py-5 sm:px-6 lg:px-8 ${theme.body}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className={`rounded-[2rem] border p-6 backdrop-blur-xl sm:p-8 ${theme.heroCard}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className={`text-[11px] uppercase tracking-[0.35em] ${theme.eyebrow}`}>
                Library
              </div>
              <h2
                className={`mt-3 text-4xl font-semibold tracking-tight md:text-5xl ${theme.title}`}
              >
                Your shelf, ready to read.
              </h2>
              <p className={`mt-4 max-w-2xl text-sm leading-6 ${theme.muted}`}>
                Import EPUBs, resume a chapter in one click, and keep progress synced with voice
                playback.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Tooltip label="Import a new book">
                <button
                  onClick={handleImportNew}
                  className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-[0_14px_30px_rgba(0,0,0,0.25)] transition active:scale-95 ${theme.primaryButton}`}
                >
                  <FiPlus className="text-base" />
                  Add Book
                </button>
              </Tooltip>
              <div
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${theme.pill}`}
              >
                {totalBooks} total
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className={`rounded-2xl border px-4 py-4 ${theme.softCard}`}>
              <div className={`text-[11px] uppercase tracking-[0.28em] ${theme.eyebrow}`}>
                Books
              </div>
              <div className={`mt-2 text-2xl font-semibold ${theme.title}`}>{totalBooks}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-4 ${theme.softCard}`}>
              <div className={`text-[11px] uppercase tracking-[0.28em] ${theme.eyebrow}`}>
                In progress
              </div>
              <div className={`mt-2 text-2xl font-semibold ${theme.title}`}>{resumedBooks}</div>
            </div>
            <div className={`rounded-2xl border px-4 py-4 ${theme.softCard}`}>
              <div className={`text-[11px] uppercase tracking-[0.28em] ${theme.eyebrow}`}>
                Finished
              </div>
              <div className={`mt-2 text-2xl font-semibold ${theme.title}`}>{finishedBooks}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="relative flex-1">
              <FiSearch
                className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${theme.inputIcon}`}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your library"
                className={`w-full rounded-2xl border py-3 pl-11 pr-4 text-sm outline-none transition ${theme.input}`}
              />
            </label>

            <div className={`text-xs uppercase tracking-[0.22em] ${theme.subtle}`}>
              {filteredLibrary.length} visible of {totalBooks}
            </div>
          </div>
        </section>

        {filteredLibrary.length > 0 ? (
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredLibrary.map((book) => (
              <article
                key={book.id}
                className="group relative cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => openBook(book)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openBook(book)
                  }
                }}
                aria-label={`Open ${book.title}`}
              >
                <div
                  className={`overflow-hidden rounded-[1.75rem] border transition duration-300 group-hover:-translate-y-1 ${theme.card}`}
                >
                  <div className={`relative aspect-[2/3] overflow-hidden ${theme.softCard}`}>
                    {book.cover ? (
                      <img
                        src={book.cover}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        alt={book.title}
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full flex-col items-center justify-center p-4 text-center ${theme.coverFallback}`}
                      >
                        <div className={`text-3xl font-semibold tracking-[0.2em] ${theme.title}`}>
                          Nur
                        </div>
                        <div className={`mt-2 text-xs uppercase tracking-[0.25em] ${theme.subtle}`}>
                          No cover
                        </div>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.48))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {typeof book.lastPageIndex === 'number' && book.lastPageIndex > 0 && (
                      <div
                        className={`absolute left-3 top-3 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] backdrop-blur-md ${theme.pill}`}
                      >
                        Continue
                      </div>
                    )}

                    <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 opacity-0 transition duration-300 group-hover:opacity-100">
                      <span
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${theme.primaryButton}`}
                      >
                        Open
                      </span>
                      <button
                        onClick={(event) => removeBook(book.id, event)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold backdrop-blur-md transition ${theme.secondaryButton}`}
                        aria-label={`Remove ${book.title}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 pb-4 pt-4">
                    <div className="min-h-12">
                      <h3 className={`text-sm font-semibold leading-snug ${theme.title}`}>
                        {book.title}
                      </h3>
                    </div>
                    <div
                      className={`flex items-center justify-between text-[11px] uppercase tracking-[0.22em] ${theme.subtle}`}
                    >
                      <span>Added {new Date(book.dateAdded).toLocaleDateString()}</span>
                      {typeof book.lastPageIndex === 'number' && book.lastPageIndex > 0 ? (
                        <span className={theme.accentText}>Resume</span>
                      ) : (
                        <span>New</span>
                      )}
                    </div>

                    {typeof book.lastPageIndex === 'number' &&
                      typeof book.totalPages === 'number' &&
                      book.totalPages > 0 && (
                        <div>
                          <div
                            className={`h-1.5 w-full overflow-hidden rounded-full ${theme.progressTrack}`}
                          >
                            <div
                              className={`h-full rounded-full ${theme.progressFill}`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(2, ((book.lastPageIndex + 1) / book.totalPages) * 100)
                                )}%`
                              }}
                            />
                          </div>
                          <div className={`mt-1 text-[11px] ${theme.subtle}`}>
                            Page {book.lastPageIndex + 1} of {book.totalPages}
                          </div>
                        </div>
                      )}

                    <div className={`rounded-2xl border px-3 py-3 ${theme.insetCard}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className={`text-[11px] uppercase tracking-[0.22em] ${theme.eyebrow}`}>
                          Local summary
                        </div>
                        {book.summary ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation()
                              event.preventDefault()
                              setSelectedSummaryBookId(book.id)
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${theme.secondaryButton}`}
                            aria-label={`Read full summary for ${book.title}`}
                          >
                            Read summary
                          </button>
                        ) : null}
                      </div>

                      {book.summary ? (
                        <>
                          <p
                            className={`mt-2 text-sm leading-6 ${theme.muted}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {book.summary}
                          </p>
                        </>
                      ) : (
                        <p className={`mt-2 text-sm leading-6 ${theme.muted}`}>
                          Create a local synopsis for this book. Nur generates it on-device from
                          the EPUB content already in your library.
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={(event) => void handleGenerateSummary(book, event)}
                          disabled={Boolean(summarizingBookId && summarizingBookId !== book.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.secondaryButton}`}
                          aria-label={
                            book.summary
                              ? `Refresh summary for ${book.title}`
                              : `Summarize ${book.title}`
                          }
                        >
                          {summarizingBookId === book.id ? (
                            <FiLoader className="animate-spin text-xs" />
                          ) : (
                            <FiRefreshCw className="text-xs" />
                          )}
                          <span>{book.summary ? 'Refresh summary' : 'Summarize book'}</span>
                        </button>

                        <div className={`text-[11px] ${theme.subtle}`}>
                          {book.summaryUpdatedAt
                            ? `Updated ${new Date(book.summaryUpdatedAt).toLocaleDateString()}`
                            : book.summary
                              ? 'Generated locally on this device'
                              : null}
                        </div>
                      </div>

                      {summaryErrors[book.id] ? (
                        <div className={`mt-2 text-xs leading-5 ${theme.dangerText}`}>
                          {summaryErrors[book.id]}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className={`rounded-[2rem] border border-dashed p-8 text-center ${theme.card}`}>
            <div className="mx-auto max-w-xl">
              <div className={`text-[11px] uppercase tracking-[0.35em] ${theme.eyebrow}`}>
                Empty shelf
              </div>
              <h3 className={`mt-3 text-2xl font-semibold ${theme.title}`}>
                Import your first book to get started.
              </h3>
              <p className={`mt-3 text-sm leading-6 ${theme.muted}`}>
                Nur keeps reading state local, so your library stays fast and private.
              </p>
              <div className="mt-6 flex justify-center">
                <Tooltip label="Import a new book">
                  <button
                    onClick={handleImportNew}
                    className={`inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition active:scale-95 ${theme.primaryButton}`}
                  >
                    <FiPlus className="text-base" />
                    Import EPUB
                  </button>
                </Tooltip>
              </div>
            </div>
          </section>
        )}
      </div>

      {selectedSummaryBook ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.dialogBackdrop}`}
          onClick={() => setSelectedSummaryBookId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-summary-title"
            className={`w-full max-w-3xl rounded-[2rem] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-7 ${theme.dialogCard}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className={`text-[11px] uppercase tracking-[0.3em] ${theme.eyebrow}`}>
                  Local summary
                </div>
                <h3
                  id="book-summary-title"
                  className={`mt-2 text-2xl font-semibold tracking-tight ${theme.title}`}
                >
                  {selectedSummaryBook.title}
                </h3>
                <div className={`mt-2 text-xs ${theme.subtle}`}>
                  {selectedSummaryBook.summaryUpdatedAt
                    ? `Updated ${new Date(selectedSummaryBook.summaryUpdatedAt).toLocaleString()}`
                    : 'Generated locally on this device'}
                  {selectedSummaryBook.summaryModel ? ` - ${selectedSummaryBook.summaryModel}` : ''}
                </div>
              </div>

              <button
                onClick={() => setSelectedSummaryBookId(null)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${theme.secondaryButton}`}
                aria-label="Close summary"
              >
                <FiX className="text-lg" />
              </button>
            </div>

            <div
              className={`mt-5 max-h-[60vh] overflow-y-auto rounded-[1.5rem] border px-5 py-5 text-base leading-8 ${theme.insetCard} ${theme.body}`}
            >
              {selectedSummaryBook.summary}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={(event) => {
                  void handleGenerateSummary(selectedSummaryBook, event)
                }}
                disabled={Boolean(
                  summarizingBookId && summarizingBookId !== selectedSummaryBook.id
                )}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.secondaryButton}`}
              >
                {summarizingBookId === selectedSummaryBook.id ? (
                  <FiLoader className="animate-spin text-sm" />
                ) : (
                  <FiRefreshCw className="text-sm" />
                )}
                <span>Refresh summary</span>
              </button>

              <button
                onClick={() => setSelectedSummaryBookId(null)}
                className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${theme.primaryButton}`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
