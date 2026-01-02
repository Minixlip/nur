import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  generate: (text: string, speed: number = 1.0) =>
    ipcRenderer.invoke('tts:generate', { text, speed }),
  loadAudio: (filepath: string) => ipcRenderer.invoke('audio:load', { filepath }),
  play: (filepath: string) => ipcRenderer.invoke('audio:play', { filepath }),
  stop: () => ipcRenderer.invoke('audio:stop'),
  // NEW:
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  readFile: (filepath: string) => ipcRenderer.invoke('fs:readFile', { filepath })
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
