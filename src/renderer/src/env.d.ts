/// <reference types="vite/client" />

interface IScanResponse {
  status: string
  audio_data: Uint8Array | null // It comes over the bridge as a Uint8Array
}

interface ICustomAPI {
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
  readFile: (filepath: string) => Promise<ArrayBuffer>
  saveBook: (
    path: string,
    title: string,
    cover: string | null
  ) => Promise<{ success: boolean; book?: SavedBook }>
  getLibrary: () => Promise<any[]>
  deleteBook: (id: string) => Promise<boolean>
  updateBookProgress: (bookId: string, progress: any) => Promise<boolean>
}

interface IElectronAPI {
  // Add any specific electron APIs you use here, or keep generic
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>
    // ... other methods if needed
  }
}

interface SavedBook {
  id: string
  title: string
  path: string
  cover?: string | null // <--- Add this
  dateAdded: string
  lastPageIndex?: number
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: ICustomAPI
  }
}

export { SavedBook }
