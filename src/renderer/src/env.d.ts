/// <reference types="vite/client" />

interface IScanResponse {
  status: string
  audio_data: Uint8Array | null // It comes over the bridge as a Uint8Array
}

interface ICustomAPI {
  generate: (text: string, speed?: number) => Promise<IScanResponse>
  loadAudio: (filepath: string) => Promise<Uint8Array>
  play: (filepath: string) => Promise<string>
  stop: () => Promise<boolean>
  openFileDialog: () => Promise<string | null>
  readFile: (filepath: string) => Promise<Uint8Array>
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
  dateAdded: string
}

interface ICustomAPI {
  // ... existing methods ...
  saveBook: (path: string, title: string) => Promise<{ success: boolean; book?: SavedBook }>
  getLibrary: () => Promise<SavedBook[]>
  deleteBook: (id: string) => Promise<boolean>
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: ICustomAPI
  }
}

export {}
