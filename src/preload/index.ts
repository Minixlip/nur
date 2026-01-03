import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  generate: (text: string, speed: number = 1.0, sessionId: string = '') =>
    ipcRenderer.invoke('tts:generate', { text, speed, sessionId }),
  // New function
  setSession: (sessionId: string) => ipcRenderer.invoke('tts:setSession', sessionId),
  loadAudio: (filepath: string) => ipcRenderer.invoke('audio:load', { filepath }),
  play: (filepath: string) => ipcRenderer.invoke('audio:play', { filepath }),
  stop: () => ipcRenderer.invoke('audio:stop'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filepath: string) => ipcRenderer.invoke('fs:readFile', { filepath }),
  saveBook: (path: string, title: string, cover: string | null) =>
    ipcRenderer.invoke('save-book', path, title, cover),
  getLibrary: () => ipcRenderer.invoke('get-library'),
  deleteBook: (id: string) => ipcRenderer.invoke('delete-book', id),

  updateBookProgress: (bookId: string, progress: any) =>
    ipcRenderer.invoke('update-book-progress', bookId, progress)
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
