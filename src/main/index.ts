import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { net } from 'electron'
import { exec } from 'child_process' // <--- Import this to run system commands

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

// --- NATIVE AUDIO HANDLER ---
// ... inside src/main/index.ts

// --- CROSS-PLATFORM AUDIO HANDLER ---
ipcMain.handle('tts:speak', async (_event, { text }) => {
  console.log(`[Main] TTS Request for: "${text.substring(0, 20)}..."`)

  return new Promise((resolve, reject) => {
    // 1. Request Audio from Python
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
        reject(`Python Server Error: ${response.statusCode}`)
        return
      }

      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))

      response.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const uniqueId = Date.now().toString()
        const tempPath = path.join(os.tmpdir(), `nur_speech_${uniqueId}.wav`)

        try {
          fs.writeFileSync(tempPath, buffer)
          console.log(`[Main] Audio saved: ${tempPath}`)

          // 2. PLAY AUDIO (Cross-Platform)
          const platform = process.platform
          let playCommand = ''

          if (platform === 'darwin') {
            // macOS
            playCommand = `afplay "${tempPath}"`
          } else if (platform === 'win32') {
            // Windows (PowerShell)
            playCommand = `powershell -c (New-Object Media.SoundPlayer '${tempPath}').PlaySync();`
          } else {
            // Linux (ALSA)
            playCommand = `aplay "${tempPath}"`
          }

          console.log(`[Main] Playing with command: ${playCommand}`)

          exec(playCommand, (error) => {
            if (error) {
              console.error(`[Main] Playback failed: ${error.message}`)
              reject(error.message)
            } else {
              console.log('[Main] Playback finished.')
              // Cleanup file after playing
              fs.unlink(tempPath, () => {})
              resolve({ status: 'success', audio_filepath: tempPath })
            }
          })
        } catch (err) {
          reject(`File Error: ${err}`)
        }
      })
    })

    request.on('error', (err) => {
      reject(`Connection Error: ${err.message}`)
    })

    request.write(
      JSON.stringify({
        text: text,
        speaker_wav: 'default_speaker.wav',
        language: 'en'
      })
    )

    request.end()
  })
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
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
