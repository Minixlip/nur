import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawn, ChildProcess } from 'child_process' // <--- Import ChildProcess

// --- PYTHON PROCESS MANAGER ---
let pythonProcess: ChildProcess | null = null
// Queue to handle requests one by one
const requestQueue: { resolve: (value: any) => void; reject: (reason?: any) => void }[] = []

function startPythonEngine(): void {
  // 1. Determine the path to the executable
  // In production (app.isPackaged), it's in resources/bin
  // In dev, we might point to the python_backend folder or just the same bin
  const scriptName = process.platform === 'win32' ? 'engine.exe' : 'engine'
  const scriptPath = is.dev
    ? join(__dirname, '../../resources/bin', scriptName)
    : join(process.resourcesPath, 'bin', scriptName)

  console.log('Starting Python Engine at:', scriptPath)

  // 2. Spawn the process
  pythonProcess = spawn(scriptPath)

  // 3. Listen for responses from Python (stdout)
  pythonProcess.stdout?.on('data', (data) => {
    const str = data.toString().trim()
    console.log(`[Python]: ${str}`)

    // Python might send multiple lines, but our engine sends one JSON per line.
    const lines = str.split('\n')

    lines.forEach((line) => {
      try {
        const response = JSON.parse(line)
        // Resolve the oldest request in the queue
        const pending = requestQueue.shift()
        if (pending) {
          if (response.status === 'success') {
            pending.resolve(response.audio_filepath)
          } else {
            pending.reject(response.message)
          }
        }
      } catch (e) {
        // Ignore non-JSON logs from Python (if any)
      }
    })
  })

  pythonProcess.stderr?.on('data', (data) => {
    console.error(`[Python Error]: ${data}`)
  })

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`)
    pythonProcess = null
  })
}

// Kill Python when Electron quits
app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill()
  }
})
// -----------------------------

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- START ENGINE ---
  startPythonEngine()

  // --- IPC HANDLER ---
  // This is what the Frontend calls: window.api.generateSpeech(...)
  ipcMain.handle('tts:speak', async (_, args) => {
    if (!pythonProcess) return Promise.reject('Engine not running')

    return new Promise((resolve, reject) => {
      // 1. Add this request to the queue
      requestQueue.push({ resolve, reject })

      // 2. Send the JSON to Python via stdin
      // Ensure we end with a newline \n so Python's "for line in sys.stdin" triggers
      const payload = JSON.stringify(args) + '\n'
      pythonProcess?.stdin?.write(payload)
    })
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
