import { useNavigate } from 'react-router-dom'
import { useBookImporter } from '../../../hooks/useBookImporter'
import { useLibrary, SavedBook } from '../../../hooks/useLibrary'

export default function Library(): React.JSX.Element {
  const navigate = useNavigate()
  const { library, addToLibrary, removeBook } = useLibrary()
  const { importBook } = useBookImporter()

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

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-10">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">My Library</h1>
          <p className="text-zinc-400">Continue your reading journey.</p>
        </div>
        <button
          onClick={handleImportNew}
          className="px-5 py-2.5 bg-white/90 text-black hover:bg-white rounded-full font-bold shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-transform active:scale-95 flex items-center gap-2"
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
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openBook(book)
              }
            }}
            aria-label={`Open ${book.title}`}
          >
            <div className="aspect-[2/3] bg-white/5 rounded-2xl mb-4 overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.35)] group-hover:shadow-[0_24px_50px_rgba(0,0,0,0.45)] group-hover:-translate-y-2 transition-all duration-300 border border-white/10 relative">
              {book.cover ? (
                <img src={book.cover} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-zinc-800/70 to-zinc-900/80 p-4 text-center">
                  <span className="text-3xl mb-2 text-zinc-200">Nur</span>
                  <span className="text-xs text-zinc-400">No cover</span>
                </div>
              )}

              {typeof book.lastPageIndex === 'number' && book.lastPageIndex > 0 && (
                <div className="absolute left-3 top-3 rounded-full bg-white/90 text-black text-[11px] font-semibold px-3 py-1 shadow-lg">
                  Continue · Page {book.lastPageIndex + 1}
                </div>
              )}

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm transform scale-90 group-hover:scale-100 transition-transform shadow-lg">
                  Open Book
                </span>
              </div>
            </div>

            <div className="px-1 space-y-1">
              <h3 className="font-semibold text-zinc-200 leading-snug truncate">
                {book.title}
              </h3>
              <div className="text-[11px] text-zinc-500 flex items-center justify-between uppercase tracking-wide">
                <span>Added</span>
                {typeof book.lastPageIndex === 'number' && book.lastPageIndex > 0 ? (
                  <span className="text-[10px] text-emerald-300/80">Resume</span>
                ) : (
                  <span className="text-[10px] text-zinc-500">New</span>
                )}
              </div>
              <div className="text-xs text-zinc-400">
                {new Date(book.dateAdded).toLocaleDateString()}
              </div>
            </div>
            {typeof book.lastPageIndex === 'number' &&
              typeof book.totalPages === 'number' &&
              book.totalPages > 0 && (
                <div className="mt-3 px-1">
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white/70"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(2, ((book.lastPageIndex + 1) / book.totalPages) * 100)
                        )}%`
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Page {book.lastPageIndex + 1} of {book.totalPages}
                  </div>
                </div>
              )}

            <button
              onClick={(e) => removeBook(book.id, e)}
              className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm"
              aria-label={`Remove ${book.title}`}
            >
              X
            </button>
          </div>
        ))}

        {library.length === 0 && (
          <div
            onClick={handleImportNew}
            className="aspect-[2/3] border-2 border-dashed border-zinc-700/70 rounded-2xl flex flex-col items-center justify-center text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 cursor-pointer transition bg-white/5"
          >
            <span className="text-2xl mb-2">+</span>
            <span>Import EPUB</span>
          </div>
        )}
      </div>
    </div>
  )
}
