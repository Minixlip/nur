import { app, shell, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { createServer } from 'node:net'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { setupLibraryHandlers } from './library'
import { installFileLogger } from './logger'
import { checkForUpdates, initAutoUpdater, quitAndInstallUpdate } from './updater'
import { registerIpcHandlers } from './registerIpcHandlers'
import { createBackendRuntime } from './backendRuntime'
import {
  ensurePiperDownloaded,
  ensureTranslationPiperDownloaded,
  getPiperOnnxPath,
  getPiperStatus,
  hasPiperModel
} from './piper'

const APP_NAME = 'Nur'
const WINDOW_TITLE = 'NUR'
const APP_ID = 'com.minixlip.nur'
const REPOSITORY_URL = 'https://github.com/Minixlip/nur'
const BACKEND_HOST = '127.0.0.1'
const DEFAULT_BACKEND_PORT = Number(process.env.NUR_BACKEND_PORT || 8000)
const isSmokeTest = process.argv.includes('--smoke-test') || process.env.NUR_SMOKE_TEST === '1'

const VOICES_DIR = join(app.getPath('userData'), 'voices')
const VOICES_DB = join(VOICES_DIR, 'voices.json')

if (!fs.existsSync(VOICES_DIR)) {
  fs.mkdirSync(VOICES_DIR, { recursive: true })
}

installFileLogger()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backendRuntime: ReturnType<typeof createBackendRuntime> | null = null

const stopActiveBackend = () => {
  backendRuntime?.stopBackend()
}

const getAvailableBackendPort = (preferredPort: number) =>
  new Promise<number>((resolve) => {
    const server = createServer()

    server.once('error', () => {
      const fallback = createServer()
      fallback.once('error', () => resolve(preferredPort))
      fallback.listen(0, BACKEND_HOST, () => {
        const address = fallback.address()
        const port = typeof address === 'object' && address ? address.port : preferredPort
        fallback.close(() => resolve(port))
      })
    })

    server.listen(preferredPort, BACKEND_HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : preferredPort
      server.close(() => resolve(port))
    })
  })

const getWindowIcon = () => nativeImage.createFromPath(icon)

const getTrayIcon = () => {
  const trayImage = nativeImage.createFromPath(icon)

  if (process.platform === 'win32') {
    return trayImage.resize({ width: 16, height: 16 })
  }

  if (process.platform === 'linux') {
    return trayImage.resize({ width: 22, height: 22 })
  }

  return trayImage
}

const hideMainWindowToTray = () => {
  if (process.platform === 'darwin') return
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setSkipTaskbar(true)
  mainWindow.hide()
}

const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.setSkipTaskbar(false)
  mainWindow.show()
  mainWindow.focus()
}

const updateTrayMenu = () => {
  if (!tray) return

  const isVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: isVisible ? 'Hide Nur' : 'Open Nur',
        click: () => {
          if (isVisible) {
            hideMainWindowToTray()
            return
          }
          showMainWindow()
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ])
  )
}

const createTray = () => {
  if (process.platform === 'darwin') return
  if (tray) return

  tray = new Tray(getTrayIcon())
  tray.setToolTip(APP_NAME)
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
  updateTrayMenu()
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 900,
    minHeight: 670,
    title: WINDOW_TITLE,
    icon: getWindowIcon(),
    minimizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true
    }
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
    updateTrayMenu()
  })

  window.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(WINDOW_TITLE)
  })

  window.on('minimize' as any, (event) => {
    if (process.platform === 'darwin') return
    event.preventDefault()
    hideMainWindowToTray()
  })

  window.on('show', () => {
    window.setSkipTaskbar(false)
    updateTrayMenu()
  })

  window.on('hide', () => {
    updateTrayMenu()
  })

  window.on('closed', () => {
    mainWindow = null
    updateTrayMenu()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  app.setName(APP_NAME)
  electronApp.setAppUserModelId(APP_ID)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const backendPort = await getAvailableBackendPort(DEFAULT_BACKEND_PORT)
  backendRuntime = createBackendRuntime({
    appName: APP_NAME,
    appId: APP_ID,
    repositoryUrl: REPOSITORY_URL,
    backendHost: BACKEND_HOST,
    backendPort,
    getPiperStatus,
    ensurePiperDownloaded
  })

  const {
    backendJsonRequest,
    getRuntimeStatus,
    getTtsStatus,
    restartBackend,
    startBackend,
    runSmokeTest
  } = backendRuntime

  setupLibraryHandlers()
  initAutoUpdater()
  registerIpcHandlers({
    backendHost: BACKEND_HOST,
    backendPort,
    voicesDir: VOICES_DIR,
    voicesDbPath: VOICES_DB,
    hasPiperModel,
    getPiperOnnxPath,
    ensurePiperDownloaded,
    ensureTranslationPiperDownloaded,
    getTtsStatus,
    getRuntimeStatus,
    restartBackend,
    checkForUpdates,
    quitAndInstallUpdate,
    backendJsonRequest
  })

  startBackend()
  if (isSmokeTest) {
    void runSmokeTest()
    return
  }

  void ensurePiperDownloaded()
  createWindow()
  createTray()
  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates()
    }, 12000)
  }
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      return
    }
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopActiveBackend()
    app.quit()
  }
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = null
  stopActiveBackend()
})
