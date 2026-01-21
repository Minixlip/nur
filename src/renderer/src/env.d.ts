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
  checkBackend: () => Promise<{ ok: boolean; ttsReady: boolean }>
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
  totalPages?: number
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: ICustomAPI
  }
}

export { SavedBook }
