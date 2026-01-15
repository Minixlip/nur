import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // UPDATED: Added options argument
      generate: (
        text: string,
        speed?: number,
        sessionId?: string,
        options?: { engine?: string; voicePath?: string | null }
      ) => Promise<any>

      setSession: (sessionId: string) => Promise<boolean>
      loadAudio: (filepath: string) => Promise<any>
      play: (filepath: string) => Promise<void>
      stop: () => Promise<void>
      openFileDialog: () => Promise<string | null>
      openAudioFileDialog: () => Promise<string | null>
      onDownloadProgress: (callback: (progress: number) => void) => () => void
      readFile: (filepath: string) => Promise<ArrayBuffer>
      revealPath: (filepath: string) => Promise<boolean>
      checkPiper: () => Promise<{ exists: boolean; path: string }>
      downloadPiper: () => Promise<boolean>
      listVoices: () => Promise<any[]>
      addVoice: (filePath: string, name: string) => Promise<{ success: boolean; voice?: any }>
      removeVoice: (id: string) => Promise<boolean>
      saveBook: (path: string, title: string, cover: string | null) => Promise<any>
      getLibrary: () => Promise<any[]>
      deleteBook: (id: string) => Promise<boolean>
      updateBookProgress: (bookId: string, progress: any) => Promise<boolean>
    }
  }
}
