import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      generate: (text: string, speed?: number, sessionId?: string) => Promise<any>
      setSession: (sessionId: string) => Promise<boolean>
      loadAudio: (filepath: string) => Promise<any>
      play: (filepath: string) => Promise<void>
      stop: () => Promise<void>

      openFileDialog: () => Promise<string | null>
      readFile: (filepath: string) => Promise<ArrayBuffer>

      // UPDATE: Definition matches implementation
      saveBook: (path: string, title: string, cover: string | null) => Promise<any>

      getLibrary: () => Promise<any[]>
      deleteBook: (id: string) => Promise<boolean>
      updateBookProgress: (bookId: string, progress: { lastPageIndex: number }) => Promise<boolean>
    }
  }
}
