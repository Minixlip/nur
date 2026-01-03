import { useState, useEffect } from 'react'

// Define the shape of a book (optional but good for TS)
export interface SavedBook {
  id: string
  title: string
  path: string
  cover?: string | null // <--- Add this
  dateAdded: string
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
    await window.api.saveBook(filePath, title, cover)
    await refreshLibrary()
  }

  const removeBook = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent clicking the book card while deleting
    if (confirm('Are you sure you want to delete this book?')) {
      await window.api.deleteBook(id)
      await refreshLibrary()
    }
  }

  // Load on startup
  useEffect(() => {
    refreshLibrary()
  }, [])

  return { library, loadingLibrary, refreshLibrary, addToLibrary, removeBook }
}
