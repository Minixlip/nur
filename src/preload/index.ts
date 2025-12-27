import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // The frontend will call this function
  generateSpeech: (text: string, modelPath: string): Promise<string> => {
    return ipcRenderer.invoke('tts:speak', {
      text,
      model_path: modelPath,
      // For now, we assume tokens is in the same folder as model, or hardcode it
      tokens_path: modelPath.replace('.onnx', '.tokens') // Simple logic for now
    })
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api) // <--- Expose our API
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
