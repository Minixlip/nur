import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // UPDATED: Now accepts 'options' as the 4th argument (engine, voicePath, etc.)
  generate: (text: string, speed: number = 1.0, sessionId: string = '', options: any = {}) =>
    ipcRenderer.invoke('tts:generate', { text, speed, sessionId, ...options }),

  setSession: (sessionId: string) => ipcRenderer.invoke('tts:setSession', sessionId),

  // --- NEW: PIPER MANAGEMENT ---
  // Checks if the model exists in user data
  checkPiper: () => ipcRenderer.invoke('tts:checkPiper'),

  // Triggers the download in Main process
  downloadPiper: () => ipcRenderer.invoke('tts:downloadPiper'),

  // Listens for progress updates (0-100) from Main
  onDownloadProgress: (callback: (progress: number) => void) => {
    const subscription = (_event: any, progress: number) => callback(progress)
    ipcRenderer.on('download-progress', subscription)
    // Return unsubscribe function so React can clean up
    return () => ipcRenderer.removeListener('download-progress', subscription)
  },
  // -----------------------------

  loadAudio: (filepath: string) => ipcRenderer.invoke('audio:load', { filepath }),
  play: (filepath: string) => ipcRenderer.invoke('audio:play', { filepath }),
  stop: () => ipcRenderer.invoke('audio:stop'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filepath: string) => ipcRenderer.invoke('fs:readFile', { filepath }),
  revealPath: (filepath: string) => ipcRenderer.invoke('fs:revealPath', { filepath }),
  listVoices: () => ipcRenderer.invoke('voice:list'),
  addVoice: (filePath: string, name: string) =>
    ipcRenderer.invoke('voice:add', { filePath, name }),
  removeVoice: (id: string) => ipcRenderer.invoke('voice:remove', { id }),
  saveBook: (path: string, title: string, cover: string | null) =>
    ipcRenderer.invoke('save-book', path, title, cover),
  getLibrary: () => ipcRenderer.invoke('get-library'),
  deleteBook: (id: string) => ipcRenderer.invoke('delete-book', id),
  updateBookProgress: (bookId: string, progress: any) =>
    ipcRenderer.invoke('update-book-progress', bookId, progress),
  openAudioFileDialog: () => ipcRenderer.invoke('dialog:openAudioFile')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
