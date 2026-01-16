import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import { net } from 'electron'
import { exec, execFile, ChildProcess } from 'child_process'
import { setupLibraryHandlers } from './library'

let currentPlayer: ChildProcess | null = null
let backendProcess: ChildProcess | null = null

// --- CONSTANTS FOR MODEL MANAGEMENT ---
const MODELS_DIR = path.join(app.getPath('userData'), 'models')
const VOICES_DIR = path.join(app.getPath('userData'), 'voices')
const VOICES_DB = path.join(VOICES_DIR, 'voices.json')
const PIPER_FILENAME = 'en_US-lessac-medium.onnx'
const PIPER_JSON = 'en_US-lessac-medium.onnx.json'

// URLs (HuggingFace direct links)
const PIPER_URL_ONNX =
  'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx?download=true'
const PIPER_URL_JSON =
  'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json?download=true'

// Ensure directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true })
}
if (!fs.existsSync(VOICES_DIR)) {
  fs.mkdirSync(VOICES_DIR, { recursive: true })
}

const readVoicesDb = () => {
  if (!fs.existsSync(VOICES_DB)) return []
  try {
    return JSON.parse(fs.readFileSync(VOICES_DB, 'utf-8'))
  } catch {
    return []
  }
}

const writeVoicesDb = (data: any[]) => {
  fs.writeFileSync(VOICES_DB, JSON.stringify(data, null, 2))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 900,
    minHeight: 670,
    minimizable: false,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
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

const getBackendExecutablePath = () => {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'nur_backend', 'nur_engine', 'nur_engine.exe'))
    candidates.push(path.join(process.resourcesPath, 'nur_backend', 'nur_engine', 'nur_engine'))
    candidates.push(path.join(process.resourcesPath, 'nur_backend', 'nur_engine.exe'))
    candidates.push(path.join(process.resourcesPath, 'nur_backend', 'nur_engine'))
    candidates.push(path.join(process.resourcesPath, 'nur_engine.exe'))
    candidates.push(path.join(process.resourcesPath, 'nur_engine'))
  } else {
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'dist', 'nur_engine', 'nur_engine.exe'))
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'dist', 'nur_engine', 'nur_engine'))
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'nur_engine', 'nur_engine.exe'))
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'nur_engine', 'nur_engine'))
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'nur_engine.exe'))
    candidates.push(path.join(app.getAppPath(), 'nur_backend', 'nur_engine'))
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

const startBackend = () => {
  if (backendProcess) return
  const backendPath = getBackendExecutablePath()
  if (!backendPath) {
    console.warn('[Main] Backend executable not found. Skipping auto-start.')
    return
  }
  backendProcess = execFile(backendPath, [], { windowsHide: true }, (error) => {
    if (error) {
      console.error('[Main] Backend exited with error:', error.message)
    }
    backendProcess = null
  })
}

const stopBackend = () => {
  if (!backendProcess) return
  try {
    backendProcess.kill()
  } catch (err) {}
  backendProcess = null
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

ipcMain.handle('dialog:openAudioFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3'] }]
  })
  if (canceled) {
    return null
  } else {
    return filePaths[0]
  }
})

// --- NEW: PIPER MODEL MANAGEMENT ---

// 1. CHECK IF MODEL EXISTS
ipcMain.handle('tts:checkPiper', () => {
  const onnxPath = path.join(MODELS_DIR, PIPER_FILENAME)
  const jsonPath = path.join(MODELS_DIR, PIPER_JSON)

  const exists = fs.existsSync(onnxPath) && fs.existsSync(jsonPath)
  return {
    exists,
    path: onnxPath // Return full path so frontend can pass to python
  }
})

// 2. DOWNLOAD MODEL
ipcMain.handle('tts:downloadPiper', async (event) => {
  const downloadFile = (url: string, filename: string) => {
    return new Promise<void>((resolve, reject) => {
      const filePath = path.join(MODELS_DIR, filename)
      const file = fs.createWriteStream(filePath)

      const request = net.request(url)

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${filename}: ${response.statusCode}`))
          return
        }

        const totalBytes = parseInt(response.headers['content-length'] as string, 10)
        let receivedBytes = 0

        response.on('data', (chunk) => {
          receivedBytes += chunk.length
          file.write(chunk)

          // Emit progress for ONNX file (it's the big one)
          if (filename.endsWith('.onnx')) {
            const progress = totalBytes ? (receivedBytes / totalBytes) * 100 : 0
            // Send to renderer
            event.sender.send('download-progress', progress)
          }
        })

        response.on('end', () => {
          file.end()
          resolve()
        })

        response.on('error', (err) => {
          fs.unlink(filePath, () => {}) // delete partial
          reject(err)
        })
      })

      request.end()
    })
  }

  try {
    console.log('[Main] Starting Piper Download...')
    await downloadFile(PIPER_URL_JSON, PIPER_JSON) // Small config first
    await downloadFile(PIPER_URL_ONNX, PIPER_FILENAME) // Big model second
    console.log('[Main] Piper Download Complete.')
    return true
  } catch (error: any) {
    console.error('[Main] Download failed:', error)
    return false
  }
})

// --------------------------------

// 1. GENERATE AUDIO
// --- 1. SET SESSION ---
ipcMain.handle('tts:setSession', async (_event, sessionId) => {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: 8000,
      path: '/session'
    })
    request.setHeader('Content-Type', 'application/json')
    request.on('error', (err) => {
      console.warn('Backend session error:', err.message)
      resolve(false)
    })
    request.on('response', () => resolve(true))
    request.write(JSON.stringify({ session_id: sessionId }))
    request.end()
  })
})

// --- 2. GENERATE AUDIO (UPDATED) ---
// Now accepts 'sessionId', 'engine', and 'voicePath'
ipcMain.handle('tts:generate', async (_event, { text, speed, sessionId, engine, voicePath }) => {
  const safeSpeed = speed || 1.0
  const safeEngine = engine || 'xtts'

  // LOGIC FIX:
  // If XTTS -> Default to 'default_speaker.wav' if missing
  // If Piper -> Default to empty string if missing (so backend throws specific error)
  let safeVoice = voicePath
  if (!safeVoice && safeEngine === 'xtts') {
    safeVoice = 'default_speaker.wav'
  }
  if (!safeVoice && safeEngine === 'piper') {
    safeVoice = ''
  }

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
      // 499 = Client Closed Request (Our custom cancellation code)
      if (response.statusCode === 499) {
        resolve({ status: 'cancelled', audio_data: null })
        return
      }
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

    // Pass parameters to Python
    // If engine is Piper, 'voicePath' contains the path to the ONNX file
    request.write(
      JSON.stringify({
        text: text,
        session_id: sessionId,
        engine: safeEngine,
        speaker_wav: safeVoice, // XTTS uses this
        piper_model_path: safeVoice, // PIPER uses this (reusing variable)
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

// 5. READ FILE
ipcMain.handle('fs:readFile', async (_event, { filepath }) => {
  return fs.readFileSync(filepath)
})

// 6. REVEAL PATH IN FILE EXPLORER
ipcMain.handle('fs:revealPath', async (_event, { filepath }) => {
  try {
    if (!filepath) return false
    shell.showItemInFolder(filepath)
    return true
  } catch (err) {
    console.error('[Main] Reveal path failed:', err)
    return false
  }
})

// 7. VOICE LIBRARY
ipcMain.handle('voice:list', async () => {
  return readVoicesDb()
})

ipcMain.handle('voice:add', async (_event, { filePath, name }) => {
  try {
    if (!filePath || !name) return { success: false }
    const voices = readVoicesDb()
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = path.extname(filePath) || '.wav'
    const safeName = String(name).trim().replace(/[^\w\- ]+/g, '').slice(0, 60) || 'Voice'
    const filename = `${id}-${safeName.replace(/\s+/g, '_')}${ext}`
    const destination = path.join(VOICES_DIR, filename)
    await fs.promises.copyFile(filePath, destination)
    const voice = {
      id,
      name: safeName,
      path: destination,
      createdAt: new Date().toISOString()
    }
    voices.unshift(voice)
    writeVoicesDb(voices)
    return { success: true, voice }
  } catch (err) {
    console.error('[Main] Voice add failed:', err)
    return { success: false }
  }
})

ipcMain.handle('voice:remove', async (_event, { id }) => {
  try {
    const voices = readVoicesDb()
    const index = voices.findIndex((v: any) => v.id === id)
    if (index === -1) return false
    const voice = voices[index]
    try {
      await fs.promises.unlink(voice.path)
    } catch (err) {}
    voices.splice(index, 1)
    writeVoicesDb(voices)
    return true
  } catch (err) {
    console.error('[Main] Voice remove failed:', err)
    return false
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupLibraryHandlers()

  startBackend()
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})
