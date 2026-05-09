import { dialog, ipcMain, net, shell } from 'electron'
import { exec, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getMainLogPath } from './logger'
import { readJsonFile, writeJsonAtomic } from './storage'
import type { RuntimeStatusSnapshot, UpdateStatusSnapshot } from '../shared/runtime'
import { DEFAULT_TTS_ENGINE, type TtsEngine, type TtsStatusSnapshot } from '../shared/tts'
import type { BookSummaryResult } from '../shared/summarization'
import type { TranslationResult, TranslationTargetLanguage } from '../shared/translation'

interface StoredVoice {
  id: string
  name: string
  path: string
  createdAt: string
}

interface RegisterIpcHandlersOptions {
  backendHost: string
  backendPort: number
  voicesDir: string
  voicesDbPath: string
  hasPiperModel: () => boolean
  getPiperOnnxPath: () => string
  ensurePiperDownloaded: () => Promise<boolean>
  ensureTranslationPiperDownloaded: (
    targetLanguage: TranslationTargetLanguage
  ) => Promise<string | null>
  getTtsStatus: () => Promise<TtsStatusSnapshot>
  getRuntimeStatus: () => RuntimeStatusSnapshot
  restartBackend: () => Promise<TtsStatusSnapshot>
  checkForUpdates: () => Promise<UpdateStatusSnapshot>
  quitAndInstallUpdate: () => boolean
  backendJsonRequest: <T>(
    method: 'GET' | 'POST',
    requestPath: string,
    body?: unknown
  ) => Promise<T | null>
}

let currentPlayer: ChildProcess | null = null

export function registerIpcHandlers({
  backendHost,
  backendPort,
  voicesDir,
  voicesDbPath,
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
}: RegisterIpcHandlersOptions) {
  const readVoicesDb = () => readJsonFile<StoredVoice[]>(voicesDbPath, [])

  const writeVoicesDb = (data: StoredVoice[]) => {
    writeJsonAtomic(voicesDbPath, data)
  }

  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'EPUB Books', extensions: ['epub'] }]
    })

    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('dialog:openAudioFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3'] }]
    })

    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('tts:checkPiper', () => ({
    exists: hasPiperModel(),
    path: getPiperOnnxPath()
  }))

  ipcMain.handle('tts:downloadPiper', async () => ensurePiperDownloaded())
  ipcMain.handle('tts:getStatus', async () => getTtsStatus())
  ipcMain.handle('app:getRuntimeStatus', async () => getRuntimeStatus())
  ipcMain.handle('app:getBackendBaseUrl', () => `http://${backendHost}:${backendPort}`)
  ipcMain.handle('app:restartBackend', async () => restartBackend())
  ipcMain.handle('app:checkForUpdates', async () => checkForUpdates())
  ipcMain.handle('app:quitAndInstallUpdate', async () => quitAndInstallUpdate())

  ipcMain.handle('app:revealLogs', async () => {
    try {
      shell.showItemInFolder(getMainLogPath())
      return true
    } catch (error) {
      console.error('[Main] Reveal logs failed:', error)
      return false
    }
  })

  ipcMain.handle('tts:ensureModel', async (_event, engine: TtsEngine) => {
    if (engine === 'piper') {
      await ensurePiperDownloaded()
      return getTtsStatus()
    }

    await backendJsonRequest('POST', '/models/prepare', { engine: 'chatterbox' })
    return getTtsStatus()
  })

  ipcMain.handle('tts:setSession', async (_event, sessionId: string) => {
    return new Promise((resolve) => {
      const request = net.request({
        method: 'POST',
        protocol: 'http:',
        hostname: backendHost,
        port: backendPort,
        path: '/session'
      })

      request.setHeader('Content-Type', 'application/json')
      request.on('error', (error) => {
        console.warn('Backend session error:', error.message)
        resolve(false)
      })
      request.on('response', (response) => {
        resolve(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300))
      })
      request.write(JSON.stringify({ session_id: sessionId }))
      request.end()
    })
  })

  ipcMain.handle('tts:health', async () => {
    const status = await getTtsStatus()
    return {
      ok: status.backendOk,
      ttsReady: status.backendOk
    }
  })

  ipcMain.handle(
    'translation:translatePage',
    async (
      _event,
      { text, targetLanguage }: { text: string; targetLanguage: TranslationTargetLanguage }
    ) => {
      return new Promise<TranslationResult>((resolve, reject) => {
        const request = net.request({
          method: 'POST',
          protocol: 'http:',
          hostname: backendHost,
          port: backendPort,
          path: '/translate'
        })

        request.setHeader('Content-Type', 'application/json')
        request.on('response', (response) => {
          const chunks: Buffer[] = []

          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8')

            if (response.statusCode !== 200) {
              if (response.statusCode === 404) {
                reject(
                  'Translation is unavailable in the running backend. Restart NUR so it can load the rebuilt backend.'
                )
                return
              }

              try {
                const payload = JSON.parse(raw) as { detail?: string }
                reject(payload.detail || `Translation failed: ${response.statusCode}`)
              } catch {
                reject(raw || `Translation failed: ${response.statusCode}`)
              }
              return
            }

            try {
              const payload = JSON.parse(raw) as {
                translated_text?: string
                target_language?: TranslationTargetLanguage
              }

              if (!payload.translated_text || !payload.target_language) {
                reject('Translation returned an invalid payload.')
                return
              }

              resolve({
                translatedText: payload.translated_text,
                targetLanguage: payload.target_language
              })
            } catch {
              reject('Translation returned invalid JSON.')
            }
          })
        })

        request.on('error', (error) => reject(error.message))
        request.write(
          JSON.stringify({
            text,
            target_language: targetLanguage
          })
        )
        request.end()
      })
    }
  )

  ipcMain.handle(
    'summary:summarizeBook',
    async (_event, { text, title }: { text: string; title: string }) => {
      return new Promise<BookSummaryResult>((resolve, reject) => {
        const request = net.request({
          method: 'POST',
          protocol: 'http:',
          hostname: backendHost,
          port: backendPort,
          path: '/summarize'
        })

        request.setHeader('Content-Type', 'application/json')
        request.on('response', (response) => {
          const chunks: Buffer[] = []

          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8')

            if (response.statusCode !== 200) {
              try {
                const payload = JSON.parse(raw) as { detail?: string }
                reject(payload.detail || `Summary failed: ${response.statusCode}`)
              } catch {
                reject(raw || `Summary failed: ${response.statusCode}`)
              }
              return
            }

            try {
              const payload = JSON.parse(raw) as {
                summary?: string
                model?: string
                generated_at?: string
              }

              if (!payload.summary || !payload.model || !payload.generated_at) {
                reject('Summary returned an invalid payload.')
                return
              }

              resolve({
                summary: payload.summary,
                model: payload.model,
                generatedAt: payload.generated_at
              })
            } catch {
              reject('Summary returned invalid JSON.')
            }
          })
        })

        request.on('error', (error) => reject(error.message))
        request.write(
          JSON.stringify({
            text,
            title
          })
        )
        request.end()
      })
    }
  )

  ipcMain.handle(
    'tts:generate',
    async (_event, { text, speed, sessionId, engine, voicePath, quality_mode, language }) => {
      const safeSpeed = speed || 1.0
      let safeEngine: TtsEngine = engine === 'chatterbox' ? 'chatterbox' : DEFAULT_TTS_ENGINE
      const safeLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'en'
      const isTranslatedPreviewLanguage =
        safeLanguage === 'es' || safeLanguage === 'fr' || safeLanguage === 'ar'

      let safeVoice = voicePath
      if (isTranslatedPreviewLanguage) {
        const translationVoicePath = await ensureTranslationPiperDownloaded(
          safeLanguage as TranslationTargetLanguage
        )

        if (!translationVoicePath) {
          throw new Error(
            `Could not prepare the ${safeLanguage.toUpperCase()} translation voice. Check your connection and try again.`
          )
        }

        safeEngine = 'piper'
        safeVoice = translationVoicePath
      }

      if (!safeVoice && safeEngine === 'piper') {
        safeVoice = hasPiperModel() ? getPiperOnnxPath() : ''
      }
      if (!safeVoice) {
        safeVoice = ''
      }

      return new Promise((resolve, reject) => {
        const request = net.request({
          method: 'POST',
          protocol: 'http:',
          hostname: backendHost,
          port: backendPort,
          path: '/tts'
        })

        request.setHeader('Content-Type', 'application/json')
        request.on('response', (response) => {
          const chunks: Buffer[] = []

          if (response.statusCode === 499) {
            resolve({ status: 'cancelled', audio_data: null })
            return
          }

          response.on('data', (chunk) => chunks.push(chunk))
          response.on('end', () => {
            if (response.statusCode !== 200) {
              const raw = Buffer.concat(chunks).toString('utf-8')
              try {
                const payload = JSON.parse(raw) as { detail?: string }
                reject(payload.detail || `Python Error: ${response.statusCode}`)
              } catch {
                reject(raw || `Python Error: ${response.statusCode}`)
              }
              return
            }

            resolve({
              status: 'success',
              audio_data: Buffer.concat(chunks)
            })
          })
        })

        request.on('error', (error) => reject(error.message))
        request.write(
          JSON.stringify({
            text,
            session_id: sessionId,
            engine: safeEngine,
            speaker_wav: safeEngine === 'chatterbox' ? safeVoice : '',
            piper_model_path: safeEngine === 'piper' ? safeVoice : '',
            language: safeLanguage,
            speed: safeSpeed,
            quality_mode: quality_mode === 'balanced' ? 'balanced' : 'studio'
          })
        )
        request.end()
      })
    }
  )

  ipcMain.handle('audio:play', async (_event, { filepath }) => {
    return new Promise((resolve, reject) => {
      if (currentPlayer) {
        try {
          currentPlayer.kill()
        } catch {}
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

  ipcMain.handle('audio:stop', async () => {
    if (currentPlayer) {
      currentPlayer.kill()
      currentPlayer = null
    }
    return true
  })

  ipcMain.handle('audio:load', async (_event, { filepath }) => {
    try {
      const buffer = fs.readFileSync(filepath)
      try {
        fs.unlinkSync(filepath)
      } catch {}
      return buffer
    } catch (error: any) {
      console.error(`[Main] Failed to load audio: ${error.message}`)
      throw error
    }
  })

  ipcMain.handle('fs:readFile', async (_event, { filepath }) => fs.readFileSync(filepath))

  ipcMain.handle('fs:revealPath', async (_event, { filepath }) => {
    try {
      if (!filepath) return false
      shell.showItemInFolder(filepath)
      return true
    } catch (error) {
      console.error('[Main] Reveal path failed:', error)
      return false
    }
  })

  ipcMain.handle('fs:openPath', async (_event, { filepath }) => {
    try {
      if (!filepath) return false
      const result = await shell.openPath(filepath)
      return result === ''
    } catch (error) {
      console.error('[Main] Open path failed:', error)
      return false
    }
  })

  ipcMain.handle('voice:list', async () => readVoicesDb())

  ipcMain.handle('voice:add', async (_event, { filePath, name }) => {
    try {
      if (!filePath || !name) return { success: false }

      const voices = readVoicesDb()
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const extension = path.extname(filePath) || '.wav'
      const safeName =
        String(name)
          .trim()
          .replace(/[^\w\- ]+/g, '')
          .slice(0, 60) || 'Voice'
      const filename = `${id}-${safeName.replace(/\s+/g, '_')}${extension}`
      const destination = path.join(voicesDir, filename)

      await fs.promises.copyFile(filePath, destination)

      const voice: StoredVoice = {
        id,
        name: safeName,
        path: destination,
        createdAt: new Date().toISOString()
      }

      voices.unshift(voice)
      writeVoicesDb(voices)
      return { success: true, voice }
    } catch (error) {
      console.error('[Main] Voice add failed:', error)
      return { success: false }
    }
  })

  ipcMain.handle('voice:remove', async (_event, { id }) => {
    try {
      const voices = readVoicesDb()
      const index = voices.findIndex((voice) => voice.id === id)
      if (index === -1) return false

      const voice = voices[index]
      try {
        await fs.promises.unlink(voice.path)
      } catch {}

      voices.splice(index, 1)
      writeVoicesDb(voices)
      return true
    } catch (error) {
      console.error('[Main] Voice remove failed:', error)
      return false
    }
  })
}
