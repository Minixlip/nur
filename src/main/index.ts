import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { net } from 'electron'
import { exec, ChildProcess } from 'child_process'

// Track the current player process so we can kill it if the user clicks Stop
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

ipcMain.handle('tts:generate', async (_event, { text, speed }) => {
  // <--- Added speed
  console.log(`[Main] Generating: "${text.substring(0, 15)}..." at speed ${speed}`)

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: 8000,
      path: '/tts'
    })

    request.setHeader('Content-Type', 'application/json')
    // ... rest of error handling ...

    request.write(
      JSON.stringify({
        text: text,
        speaker_wav: 'default_speaker.wav',
        language: 'en',
        speed: speed || 1.2 // Default to 1.2x (Faster generation)
      })
    )

    request.end()
  })
})

// 2. PLAY FILE (Native & Cross-Platform)
ipcMain.handle('audio:play', async (_event, { filepath }) => {
  return new Promise((resolve, reject) => {
    // Safety: Stop any existing audio first
    if (currentPlayer) {
      try {
        currentPlayer.kill()
      } catch (e) {}
    }

    const platform = process.platform
    let fullCommand = ''

    // --- FIX IS HERE: Correctly construct the command string for each OS ---
    if (platform === 'darwin') {
      // macOS
      fullCommand = `afplay "${filepath}"`
    } else if (platform === 'win32') {
      // Windows: Use PowerShell to play the WAV file silently (no popup window)
      // We replace single quotes in path to prevent breaking the PS command
      const safePath = filepath.replace(/'/g, "''")
      fullCommand = `powershell -c "(New-Object Media.SoundPlayer '${safePath}').PlaySync();"`
    } else {
      // Linux
      fullCommand = `aplay "${filepath}"`
    }

    console.log(`[Main] Executing: ${fullCommand}`)

    // Execute the FULL command string
    currentPlayer = exec(fullCommand, (error) => {
      currentPlayer = null // Reset when done

      if (error && !error.killed) {
        console.error(`[Main] Play error: ${error.message}`)
        reject(error.message)
      } else {
        // Clean up file to save disk space
        fs.unlink(filepath, () => {})
        resolve('done')
      }
    })
  })
})

// 3. STOP PLAYBACK (Immediate Kill)
ipcMain.handle('audio:stop', async () => {
  if (currentPlayer) {
    console.log('[Main] Stopping playback...')
    currentPlayer.kill()
    currentPlayer = null
  }
  return true
})

// 4. LOAD AUDIO FILE (For gapless playback in frontend)
ipcMain.handle('audio:load', async (_event, { filepath }) => {
  try {
    // Read the file into a buffer
    const buffer = fs.readFileSync(filepath)
    // Return raw buffer (Electron handles sending this to frontend efficiently)
    return buffer
  } catch (err: any) {
    console.error(`[Main] Failed to load audio: ${err.message}`)
    throw err
  }
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
