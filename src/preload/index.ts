import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Passes text AND speed to the main process
  generate: (text: string, speed: number = 1.0) =>
    ipcRenderer.invoke('tts:generate', { text, speed }),
  loadAudio: (filepath: string) => ipcRenderer.invoke('audio:load', { filepath }),
  play: (filepath: string) => ipcRenderer.invoke('audio:play', { filepath }),
  stop: () => ipcRenderer.invoke('audio:stop')
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
