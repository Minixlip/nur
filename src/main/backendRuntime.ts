import { app, net } from 'electron'
import { execFile, type ChildProcess } from 'node:child_process'
import fs from 'fs'
import path from 'path'
import { appendBackendLogLine, getBackendLogPath, getLogsDir, getMainLogPath } from './logger'
import { getUpdateStatus } from './updater'
import { createModelStatus, type TtsBackendState, type TtsModelStatus, type TtsStatusSnapshot } from '../shared/tts'
import type { RuntimeStatusSnapshot } from '../shared/runtime'

type BackendRuntimeOptions = {
  appName: string
  appId: string
  repositoryUrl: string
  backendHost: string
  backendPort: number
  getPiperStatus: () => TtsModelStatus
  ensurePiperDownloaded: () => Promise<boolean>
}

type BackendRuntimeState = {
  state: TtsBackendState
  path: string | null
  configured: boolean
  running: boolean
  message: string | null
  lastError: string | null
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getModelsDir = () => path.join(app.getPath('userData'), 'models')
const getVoicesDir = () => path.join(app.getPath('userData'), 'voices')

export const createBackendRuntime = ({
  appName,
  appId,
  repositoryUrl,
  backendHost,
  backendPort,
  getPiperStatus,
  ensurePiperDownloaded
}: BackendRuntimeOptions) => {
  let backendProcess: ChildProcess | null = null

  const backendState: BackendRuntimeState = {
    state: 'starting',
    path: null,
    configured: false,
    running: false,
    message: 'Nur engine has not started yet.',
    lastError: null
  }

  const setBackendState = (next: Partial<BackendRuntimeState>) => {
    Object.assign(backendState, next)
  }

  const backendJsonRequest = <T>(method: 'GET' | 'POST', requestPath: string, body?: unknown) => {
    return new Promise<T | null>((resolve) => {
      const request = net.request({
        method,
        protocol: 'http:',
        hostname: backendHost,
        port: backendPort,
        path: requestPath
      })

      if (body !== undefined) {
        request.setHeader('Content-Type', 'application/json')
      }

      request.on('error', () => resolve(null))
      request.on('response', (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          resolve(null)
          return
        }

        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T
            resolve(payload)
          } catch {
            resolve(null)
          }
        })
      })

      if (body !== undefined) {
        request.write(JSON.stringify(body))
      }

      request.end()
    })
  }

  const getRuntimeStatus = (): RuntimeStatusSnapshot => ({
    diagnostics: {
      appName,
      appVersion: app.getVersion(),
      platform: process.platform,
      packaged: app.isPackaged,
      appId,
      repositoryUrl,
      userDataPath: app.getPath('userData'),
      modelsDir: getModelsDir(),
      voicesDir: getVoicesDir(),
      logsDir: getLogsDir(),
      mainLogPath: getMainLogPath(),
      backendLogPath: getBackendLogPath(),
      backendPath: backendState.path,
      backendConfigured: backendState.configured,
      backendRunning: backendState.running,
      backendMessage: backendState.lastError || backendState.message
    },
    update: getUpdateStatus()
  })

  const waitForBackendReady = async (timeoutMs = 12000) => {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const status = await getBackendTtsStatus()
      if (status.backendOk) return true
      await wait(400)
    }

    return false
  }

  const getBackendTtsStatus = async (): Promise<{
    backendOk: boolean
    backendMessage: string | null
    device: string | null
    chatterbox: TtsModelStatus
  }> => {
    const payload = await backendJsonRequest<{
      device?: string
      chatterbox?: { state?: TtsModelStatus['state']; message?: string; device?: string }
    }>('GET', '/models/status')

    if (!payload) {
      const backendMessage =
        backendState.lastError ||
        backendState.message ||
        (backendState.configured
          ? 'Waiting for Nur engine...'
          : 'Nur engine executable is missing from this build.')

      return {
        backendOk: false,
        backendMessage,
        device: null,
        chatterbox: createModelStatus('chatterbox', 'missing', {
          message: backendMessage
        })
      }
    }

    const device = payload.chatterbox?.device || payload.device || 'unknown'
    const state = payload.chatterbox?.state || 'missing'
    if (backendState.state !== 'running' || !backendState.running) {
      setBackendState({
        state: 'running',
        running: true,
        message: 'Nur engine is running.',
        lastError: null
      })
    }

    return {
      backendOk: true,
      backendMessage: null,
      device,
      chatterbox: createModelStatus('chatterbox', state, {
        message:
          payload.chatterbox?.message || 'Chatterbox is available as an optional download.'
      })
    }
  }

  const getTtsStatus = async (): Promise<TtsStatusSnapshot> => {
    const backendStatus = await getBackendTtsStatus()
    return {
      backendOk: backendStatus.backendOk,
      backendState: backendState.state,
      backendMessage: backendStatus.backendMessage,
      backendLogPath: getBackendLogPath(),
      mainLogPath: getMainLogPath(),
      device: backendStatus.device,
      piper: getPiperStatus(),
      chatterbox: backendStatus.chatterbox
    }
  }

  const getBackendExecutablePath = () => {
    const preferWindowsBinary = process.platform === 'win32'
    const binaryNames = preferWindowsBinary
      ? ['nur_engine.exe', 'nur_engine']
      : ['nur_engine', 'nur_engine.exe']

    const baseDirs = app.isPackaged
      ? [
          path.join(process.resourcesPath, 'nur_backend', 'nur_engine'),
          path.join(process.resourcesPath, 'nur_backend'),
          process.resourcesPath
        ]
      : [
          path.join(app.getAppPath(), 'nur_backend', 'dist', 'nur_engine'),
          path.join(app.getAppPath(), 'nur_backend', 'nur_engine'),
          path.join(app.getAppPath(), 'nur_backend')
        ]

    const candidates = baseDirs.flatMap((baseDir) =>
      binaryNames.map((binaryName) => path.join(baseDir, binaryName))
    )

    const resolved =
      candidates.find((candidate) => {
        if (!fs.existsSync(candidate)) return false
        if (process.platform !== 'win32' && candidate.endsWith('.exe')) return false
        return true
      }) || null

    if (!resolved) {
      const incompatible = candidates.find(
        (candidate) => fs.existsSync(candidate) && process.platform !== 'win32' && candidate.endsWith('.exe')
      )
      if (incompatible) {
        console.error(
          `[Main] Found an incompatible Windows backend in a ${process.platform} build: ${incompatible}`
        )
      }
    }

    return resolved
  }

  const startBackend = () => {
    if (backendProcess) return
    const backendPath = getBackendExecutablePath()
    setBackendState({
      state: backendPath ? 'starting' : 'missing',
      path: backendPath,
      configured: Boolean(backendPath),
      running: false,
      message: backendPath ? 'Starting Nur engine...' : 'Nur engine executable was not found.',
      lastError: backendPath ? null : 'Nur engine executable was not found.'
    })

    if (!backendPath) {
      console.warn('[Main] Backend executable not found. Skipping auto-start.')
      return
    }

    console.log(`[Main] Launching Nur engine for ${process.platform}: ${backendPath}`)
    const child = execFile(backendPath, [], {
      ...(process.platform === 'win32' ? { windowsHide: true } : {}),
      env: {
        ...process.env,
        NUR_BACKEND_HOST: backendHost,
        NUR_BACKEND_PORT: String(backendPort)
      }
    })
    backendProcess = child

    child.once('spawn', () => {
      setBackendState({
        state: 'running',
        path: backendPath,
        configured: true,
        running: true,
        message: 'Nur engine is running.',
        lastError: null
      })
      console.log('[Main] Nur engine started:', backendPath)
    })

    child.stdout?.on('data', (chunk) => {
      const message = String(chunk).trim()
      if (message) {
        appendBackendLogLine(`[stdout] ${message}`)
        console.log('[Nur engine]', message)
      }
    })

    child.stderr?.on('data', (chunk) => {
      const message = String(chunk).trim()
      if (message) {
        appendBackendLogLine(`[stderr] ${message}`)
        console.error('[Nur engine]', message)
      }
    })

    child.on('error', (error) => {
      const message = `Nur engine failed to start: ${error.message}`
      setBackendState({
        state: 'error',
        running: false,
        message,
        lastError: message
      })
      appendBackendLogLine(`[error] ${message}`)
      console.error('[Main]', message)
    })

    child.on('exit', (code, signal) => {
      backendProcess = null
      const isExpectedShutdown = signal === 'SIGTERM' || signal === 'SIGINT'
      const message = isExpectedShutdown
        ? 'Nur engine stopped.'
        : `Nur engine exited unexpectedly (${code ?? signal ?? 'unknown'}).`
      setBackendState({
        state: isExpectedShutdown ? 'stopped' : 'error',
        running: false,
        message,
        lastError: isExpectedShutdown ? null : message
      })
      appendBackendLogLine(`[exit] ${message}`)
      console.warn('[Main]', message)
    })
  }

  const stopBackend = () => {
    if (!backendProcess) return
    try {
      backendProcess.kill()
    } catch {}
    backendProcess = null
    setBackendState({
      state: 'stopped',
      running: false,
      message: 'Nur engine stopped.',
      lastError: null
    })
    appendBackendLogLine('[stop] Nur engine stopped.')
  }

  const restartBackend = async () => {
    stopBackend()
    await wait(250)
    startBackend()
    await waitForBackendReady()
    return getTtsStatus()
  }

  const runSmokeTest = async () => {
    console.log('[Smoke] Starting packaged smoke test...')
    startBackend()

    const backendReady = await waitForBackendReady(15000)
    if (!backendReady) {
      console.error('[Smoke] Backend failed to become ready.', getRuntimeStatus())
      app.exit(1)
      return
    }

    if (process.env.NUR_SMOKE_DOWNLOAD_PIPER === '1') {
      const piperReady = await ensurePiperDownloaded()
      if (!piperReady) {
        console.error('[Smoke] Piper download failed.')
        app.exit(1)
        return
      }
    }

    console.log('[Smoke] Smoke test passed.')
    app.exit(0)
  }

  return {
    backendJsonRequest,
    getRuntimeStatus,
    getTtsStatus,
    waitForBackendReady,
    startBackend,
    stopBackend,
    restartBackend,
    runSmokeTest
  }
}
