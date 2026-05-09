/// <reference types="vite/client" />
import type { BookSummaryResult } from '../../shared/summarization'
import type { TtsEngine, TtsStatusSnapshot } from '../../shared/tts'
import type { RuntimeStatusSnapshot, UpdateStatusSnapshot } from '../../shared/runtime'
import type { TranslationResult, TranslationTargetLanguage } from '../../shared/translation'

interface IScanResponse {
  status: string
  audio_data: Uint8Array | null // It comes over the bridge as a Uint8Array
}

interface ICustomAPI {
  generate: (
    text: string,
    speed?: number,
    sessionId?: string,
    options?: {
      engine?: string
      voicePath?: string | null
      quality_mode?: string
      language?: string
    }
  ) => Promise<any>

  setSession: (sessionId: string) => Promise<boolean>
  checkBackend: () => Promise<{ ok: boolean; ttsReady: boolean }>
  getTtsStatus: () => Promise<TtsStatusSnapshot>
  ensureModel: (engine: TtsEngine) => Promise<TtsStatusSnapshot>
  getBackendBaseUrl: () => Promise<string>
  translatePage: (
    text: string,
    targetLanguage: TranslationTargetLanguage
  ) => Promise<TranslationResult>
  summarizeBook: (text: string, title: string) => Promise<BookSummaryResult>
  getRuntimeStatus: () => Promise<RuntimeStatusSnapshot>
  restartBackend: () => Promise<TtsStatusSnapshot>
  checkForUpdates: () => Promise<UpdateStatusSnapshot>
  quitAndInstallUpdate: () => Promise<boolean>
  revealLogs: () => Promise<boolean>
  loadAudio: (filepath: string) => Promise<any>
  play: (filepath: string) => Promise<void>
  stop: () => Promise<void>
  openFileDialog: () => Promise<string | null>
  openAudioFileDialog: () => Promise<string | null>
  onDownloadProgress: (callback: (progress: number) => void) => () => void
  readFile: (filepath: string) => Promise<ArrayBuffer>
  revealPath: (filepath: string) => Promise<boolean>
  openPath: (filepath: string) => Promise<boolean>
  checkPiper: () => Promise<{ exists: boolean; path: string }>
  downloadPiper: () => Promise<boolean>
  listVoices: () => Promise<any[]>
  addVoice: (filePath: string, name: string) => Promise<{ success: boolean; voice?: any }>
  removeVoice: (id: string) => Promise<boolean>
  saveBook: (path: string, title: string, cover: string | null) => Promise<any>
  getLibrary: () => Promise<any[]>
  deleteBook: (id: string) => Promise<boolean>
  updateBookSummary: (
    bookId: string,
    summary: string | null,
    summaryUpdatedAt: string | null,
    summaryModel: string | null
  ) => Promise<boolean>
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
  lastAnchorSentenceIndex?: number
  summary?: string | null
  summaryUpdatedAt?: string | null
  summaryModel?: string | null
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: ICustomAPI
  }
}

export { SavedBook }
