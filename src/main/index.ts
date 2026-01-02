import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron' // <--- Added dialog
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { net } from 'electron'
import { exec, ChildProcess } from 'child_process'

let currentPlayer: ChildProcess | null = null

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
      webSecurity: false
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

// --- NEW: FILE DIALOG HANDLER ---
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'EPUB Books', extensions: ['epub'] }]
  })
  if (canceled) {
    return null
  } else {
    // Return the path so frontend can read it
    return filePaths[0]
  }
})
// --------------------------------

// 1. GENERATE AUDIO
ipcMain.handle('tts:generate', async (_event, { text, speed }) => {
  const safeSpeed = speed || 1.0
  console.log(`[Main] Requesting: "${text.substring(0, 10)}..."`)

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: 8000,
      path: '/tts'
    })

    request.setHeader('Content-Type', 'application/json')

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(`Python Error: ${response.statusCode}`)
        return
      }
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const buffer = Buffer.concat(chunks)
        resolve({ status: 'success', audio_data: buffer })
      })
    })

    request.on('error', (err) => reject(err.message))

    request.write(
      JSON.stringify({
        text: text,
        speaker_wav: 'default_speaker.wav',
        language: 'en',
        speed: safeSpeed
      })
    )

    request.end()
  })
})

// 2. PLAY FILE (Native Fallback - mostly unused now due to Web Audio)
ipcMain.handle('audio:play', async (_event, { filepath }) => {
  return new Promise((resolve, reject) => {
    if (currentPlayer) {
      try {
        currentPlayer.kill()
      } catch (e) {}
    }
    const platform = process.platform
    let fullCommand = ''
    if (platform === 'darwin') {
      fullCommand = `afplay "${filepath}"`
    } else if (platform === 'win32') {
      const safePath = filepath.replace(/'/g, "''")
      fullCommand = `powershell -c "(New-Object Media.SoundPlayer '${safePath}').PlaySync();"`
    } else {
      fullCommand = `aplay "${filepath}"`
    }
    currentPlayer = exec(fullCommand, (error) => {
      currentPlayer = null
      if (error && !error.killed) {
        reject(error.message)
      } else {
        fs.unlink(filepath, () => {})
        resolve('done')
      }
    })
  })
})

// 3. STOP PLAYBACK
ipcMain.handle('audio:stop', async () => {
  if (currentPlayer) {
    currentPlayer.kill()
    currentPlayer = null
  }
  return true
})

// 4. LOAD AUDIO FILE
ipcMain.handle('audio:load', async (_event, { filepath }) => {
  try {
    const buffer = fs.readFileSync(filepath)
    try {
      fs.unlinkSync(filepath)
    } catch (e) {}
    return buffer
  } catch (err: any) {
    console.error(`[Main] Failed to load audio: ${err.message}`)
    throw err
  }
})

// 5. READ FILE (To load EPUB data into memory)
ipcMain.handle('fs:readFile', async (_event, { filepath }) => {
  return fs.readFileSync(filepath) // Returns buffer
})

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
