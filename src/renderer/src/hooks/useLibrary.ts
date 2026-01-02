import { useState, useEffect } from 'react'

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

  const addToLibrary = async (filePath: string, title: string) => {
    await window.api.saveBook(filePath, title)
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
