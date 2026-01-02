import { app, shell, BrowserWindow, ipcMain } from 'electron'
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

// 1. GENERATE AUDIO (With Speed Control)
ipcMain.handle('tts:generate', async (_event, { text, speed }) => {
  // Default to 1.0 if speed is missing
  const safeSpeed = speed || 1.0
  console.log(`[Main] Generating: "${text.substring(0, 15)}..." (Speed: ${safeSpeed})`)

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
        const uniqueId = Date.now().toString() + Math.random().toString().slice(2, 5)
        const tempPath = path.join(os.tmpdir(), `nur_seg_${uniqueId}.wav`)

        try {
          fs.writeFileSync(tempPath, buffer)
          resolve({ status: 'success', audio_filepath: tempPath })
        } catch (err) {
          reject(`File Write Error: ${err}`)
        }
      })
    })

    request.on('error', (err) => {
      console.error('[Main] Request Error:', err)
      reject(err.message)
    })

    // Send the JSON body with the speed parameter
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

// 2. PLAY FILE (Native Fallback)
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

// 4. LOAD AUDIO FILE (For Frontend Gapless Playback)
ipcMain.handle('audio:load', async (_event, { filepath }) => {
  try {
    const buffer = fs.readFileSync(filepath)
    // Clean up file immediately after reading into memory
    try {
      fs.unlinkSync(filepath)
    } catch (e) {}
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
