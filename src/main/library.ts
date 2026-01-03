import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export function setupLibraryHandlers() {
  // 1. DEFINE PATHS
  const LIBRARY_PATH = path.join(app.getPath('userData'), 'library')
  const DB_PATH = path.join(LIBRARY_PATH, 'books.json')

  // 2. ENSURE DIRECTORY EXISTS
  if (!fs.existsSync(LIBRARY_PATH)) {
    fs.mkdirSync(LIBRARY_PATH, { recursive: true })
  }

  // 3. HELPER FUNCTIONS
  const readDb = () => {
    if (!fs.existsSync(DB_PATH)) return []
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    } catch {
      return []
    }
  }

  const writeDb = (data: any[]) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
  }

  // 4. REGISTER HANDLERS

  // --- SAVE BOOK ---
  // Updated to accept 'cover' (Base64 string)
  ipcMain.handle('save-book', async (_, originalPath, title, cover) => {
    try {
      const books = readDb()

      const id = uuidv4()
      const extension = path.extname(originalPath)
      const newFilename = `${id}${extension}`
      const destinationPath = path.join(LIBRARY_PATH, newFilename)

      // Copy file to internal storage
      await fs.promises.copyFile(originalPath, destinationPath)

      const newBook = {
        id,
        title: title || 'Unknown Book',
        path: destinationPath,
        cover: cover || null, // <--- SAVE THE COVER HERE
        dateAdded: new Date().toISOString()
      }

      books.push(newBook)
      writeDb(books)

      return { success: true, book: newBook }
    } catch (err: any) {
      console.error('Save Error:', err)
      return { success: false, error: err.message }
    }
  })

  // --- GET LIBRARY ---
  ipcMain.handle('get-library', async () => {
    return readDb()
  })

  // --- DELETE BOOK ---
  ipcMain.handle('delete-book', async (_, bookId) => {
    const books = readDb()
    const bookIndex = books.findIndex((b: any) => b.id === bookId)

    if (bookIndex !== -1) {
      const book = books[bookIndex]
      // Delete the actual file
      try {
        await fs.promises.unlink(book.path)
      } catch (e) {
        console.warn('Could not delete file', e)
      }

      // Remove from JSON
      books.splice(bookIndex, 1)
      writeDb(books)
    }
    return true
  })

  // --- UPDATE BOOK PROGRESS ---
  ipcMain.handle('update-book-progress', async (_, bookId, progress) => {
    try {
      const books = readDb()
      const bookIndex = books.findIndex((b: any) => b.id === bookId)

      if (bookIndex !== -1) {
        // Update the specific fields (e.g., page index, percentage)
        books[bookIndex] = { ...books[bookIndex], ...progress }
        writeDb(books)
        return true
      }
      return false
    } catch (err) {
      console.error('Update Error:', err)
      return false
    }
  })

  console.log('📚 Library handlers initialized at:', LIBRARY_PATH)
}
