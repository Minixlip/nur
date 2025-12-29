import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import os from 'os'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Optional: Helps if you have issues loading local audio files
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- NEW TTS HANDLER ---
// This listens for the frontend command and talks to your Python Server
ipcMain.handle('tts:speak', async (_event, { text }) => {
  try {
    console.log(`[Main] TTS Request received: "${text.substring(0, 20)}..."`)

    // 1. Send request to your local Python Server (XTTS)
    // Ensure your python server is running on port 8000!
    const response = await fetch('http://127.0.0.1:8000/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        speaker_wav: 'default_speaker.wav', // Matches the file in your nur_backend folder
        language: 'en'
      })
    })

    if (!response.ok) {
      throw new Error(`Python Server Error: ${response.status} ${response.statusText}`)
    }

    // 2. Convert the response (audio blob) into a buffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 3. Save to a temporary file with a unique name (prevents caching issues)
    const uniqueId = Date.now().toString()
    const filename = `nur_speech_${uniqueId}.wav`
    const tempPath = path.join(os.tmpdir(), filename)

    fs.writeFileSync(tempPath, buffer)
    console.log(`[Main] Audio saved to: ${tempPath}`)

    // 4. Return the file path to the frontend
    return { status: 'success', audio_filepath: tempPath }
  } catch (error: any) {
    console.error('[Main] TTS Failed:', error)
    return { status: 'error', message: error.message || String(error) }
  }
})
// -----------------------

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
