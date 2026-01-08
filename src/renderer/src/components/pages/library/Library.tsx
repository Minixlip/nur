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
                  <span className="text-4xl mb-2">Book</span>
                </div>
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm transform scale-90 group-hover:scale-100 transition-transform">
                  Read
                </span>
              </div>
            </div>

            <h3 className="font-bold text-zinc-200 leading-tight truncate px-1">{book.title}</h3>
            <p className="text-xs text-zinc-500 mt-1 px-1">
              {new Date(book.dateAdded).toLocaleDateString()}
            </p>

            <button
              onClick={(e) => removeBook(book.id, e)}
              className="absolute top-2 right-2 bg-black/60 hover:bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm"
            >
              X
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
  )
}
