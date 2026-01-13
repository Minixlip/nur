import { useState, useEffect } from 'react'

// Define the shape of a book (optional but good for TS)
export interface SavedBook {
  id: string
  title: string
  path: string
  cover?: string | null
  dateAdded: string
  lastPageIndex?: number // <--- New Field
  totalPages?: number
}

export function useLibrary() {
  const [library, setLibrary] = useState<SavedBook[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(true)

  const refreshLibrary = async () => {
    try {
      setLoadingLibrary(true)
      const books = await window.api.getLibrary()
      // Sort by newest first
      setLibrary(
        books.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
      )
    } catch (e) {
      console.error('Failed to load library', e)
    } finally {
      setLoadingLibrary(false)
    }
  }

  // UPDATE: Accept cover argument
  const addToLibrary = async (filePath: string, title: string, cover: string | null) => {
    const result = await window.api.saveBook(filePath, title, cover)
    await refreshLibrary()
    return result?.book ?? null
  }

  const removeBook = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent clicking the book card while deleting
    if (confirm('Are you sure you want to delete this book?')) {
      await window.api.deleteBook(id)
      await refreshLibrary()
    }
  }

  const updateProgress = async (bookId: string, pageIndex: number, totalPages?: number) => {
    // Optimistically update local state so UI doesn't lag
    setLibrary((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, lastPageIndex: pageIndex, totalPages } : b
      )
    )
    // Send to backend
    await window.api.updateBookProgress(bookId, { lastPageIndex: pageIndex, totalPages })
  }

  // Load on startup
  useEffect(() => {
    refreshLibrary()
  }, [])

  return { library, loadingLibrary, refreshLibrary, addToLibrary, removeBook, updateProgress }
}
