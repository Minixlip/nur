import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // Define our new function here
      generateSpeech: (text: string, modelPath: string) => Promise<string>
    }
  }
}
