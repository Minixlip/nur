import { useEffect, useState } from 'react'
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import { useReaderSettings } from './hooks/useReaderSettings'
import { useTtsStatus } from './hooks/useTtsStatus'
import { useRuntimeStatus } from './hooks/useRuntimeStatus'
import { getAppTheme } from './theme/appTheme'
import { getModelStatusForEngine, isEngineReady, setStoredTtsEngine } from './utils/tts'

/* Pages */
import Library from './components/pages/library/Library'
import Reader from './components/pages/reader/Reader'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'

const getEngineDisplayName = (engine: string) =>
  engine === 'chatterbox' ? 'Chatterbox' : 'Piper'

const routeMeta: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Library',
    description: 'Browse your shelf, resume a book, or import something new.'
  },
  '/voice-market': {
    title: 'Voice Studio',
    description: 'Manage voices, cloning, and narration preferences.'
  },
  '/settings': {
    title: 'Settings',
    description: 'Tune playback, diagnostics, and release options.'
  }
}

type AppFrameProps = {
  collapsed: boolean
  engine: string
  backendReady: boolean
  backendOk: boolean
  backendState: string
  appVersion: string
  packaged: boolean
  statusMessage: string | null
  backendMessage: string | null
  progress: number | null
  selectedModelState: string
  selectedModelMessage: string | null
  onToggleSidebar: () => void
  onRetry: () => void | Promise<void>
  onRevealLogs: () => void | Promise<void>
  onUsePiper: () => void | Promise<void>
}

function AppFrame({
  collapsed,
  engine,
  backendReady,
  backendOk,
  backendState,
  appVersion,
  packaged,
  statusMessage,
  backendMessage,
  progress,
  selectedModelState,
  selectedModelMessage,
  onToggleSidebar,
  onRetry,
  onRevealLogs,
  onUsePiper
}: AppFrameProps): React.JSX.Element {
  const { settings } = useReaderSettings()
  const theme = getAppTheme(settings.theme)
  const location = useLocation()
  const meta =
    routeMeta[location.pathname] ||
    (location.pathname.startsWith('/read/')
      ? { title: 'Reader', description: 'Continue reading with synced playback.' }
      : routeMeta['/'])
  const isReaderRoute = location.pathname.startsWith('/read/')
  const isSettingsRoute = location.pathname === '/settings'
  const hasBackendIssue = !backendOk && backendState === 'error'
  const hasModelIssue = selectedModelState === 'error'
  const isPreparingPiper = engine === 'piper' && selectedModelState === 'downloading'
  const showPiperShortcut = engine === 'chatterbox' && backendOk
  const showOpenSettings = hasBackendIssue || hasModelIssue
  const showRetryAction = hasBackendIssue || hasModelIssue
  const showRevealLogs = hasBackendIssue
  const showDevVersion = !packaged
  const diagnosticMessage = hasBackendIssue
    ? backendMessage || statusMessage || 'Nur could not start the local speech engine.'
    : hasModelIssue
      ? selectedModelMessage || 'The selected voice model could not be prepared.'
      : null

  const overlayTitle = () => {
    if (hasBackendIssue) {
      return 'Engine needs attention'
    }
    if (!backendOk) {
      return 'Starting Nur'
    }
    if (engine === 'piper') {
      return hasModelIssue ? 'Voice setup failed' : 'Getting your voice ready'
    }
    return hasModelIssue ? 'Chatterbox needs attention' : 'Preparing Chatterbox'
  }

  const overlayHint = () => {
    if (hasBackendIssue) {
      return 'Nur could not finish starting the local speech engine.'
    }

    if (!backendOk) {
      return 'Launching the local speech engine. This should only take a moment.'
    }

    if (engine === 'piper') {
      if (isPreparingPiper) {
        return 'Downloading the default voice for first use. This only happens once.'
      }
      if (hasModelIssue) {
        return 'The default voice could not be prepared.'
      }
      return 'Preparing your default voice so the reader is ready right away.'
    }

    if (hasModelIssue) {
      return 'Chatterbox could not be prepared with the current setup.'
    }
    return 'High-quality Chatterbox setup can take a few minutes on first launch.'
  }

  const overlaySupportingCopy = () => {
    if (hasBackendIssue || hasModelIssue) {
      return null
    }
    if (!backendOk) {
      return 'Nur will continue automatically as soon as the engine is ready.'
    }
    if (engine === 'chatterbox') {
      return 'Need something faster? Switch to Piper and start reading immediately.'
    }
    return 'Nur will continue automatically as soon as setup finishes.'
  }

  const hasOverlayActions = showRetryAction || showRevealLogs || showOpenSettings || showPiperShortcut

  return (
    <div className={`relative flex h-screen overflow-hidden ${theme.shell}`}>
      <div className={`pointer-events-none absolute inset-0 ${theme.shellBackdrop}`} />
      <div
        className={`pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full blur-[140px] ${theme.shellGlowPrimary}`}
      />
      <div
        className={`pointer-events-none absolute -bottom-48 right-[-8%] h-[420px] w-[520px] rounded-full blur-[140px] ${theme.shellGlowSecondary}`}
      />

      <div className="relative z-10 flex h-full w-full">
        <Sidebar collapsed={collapsed} onToggleCollapse={onToggleSidebar} />

        <main className={`flex min-w-0 flex-1 flex-col overflow-hidden border-l ${theme.mainPanel}`}>
          {!isReaderRoute && (
            <header className={`flex items-center justify-between border-b px-6 py-4 lg:px-8 ${theme.headerBorder}`}>
              <div className="min-w-0">
                <div className={`text-[11px] uppercase tracking-[0.35em] ${theme.eyebrow}`}>Nur</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className={`text-lg font-semibold ${theme.title}`}>{meta.title}</h1>
                  <p className={`text-sm ${theme.muted}`}>{meta.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]">
                <div className={`rounded-full border px-3 py-1.5 ${backendOk ? theme.readyBadge : theme.pendingBadge}`}>
                  {backendOk ? 'Engine ready' : 'Preparing engine'}
                </div>
                <div className={`hidden rounded-full border px-3 py-1.5 md:block ${theme.pill}`}>
                  {getEngineDisplayName(engine)}
                </div>
              </div>
            </header>
          )}

          <div className="relative flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/read/:bookId" element={<Reader />} />
              <Route path="/voice-market" element={<Voice />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>

      {!backendReady && !isSettingsRoute && (
        <div className={`absolute inset-0 z-20 flex items-center justify-center backdrop-blur-2xl ${theme.overlayBackdrop}`}>
          <div className={`w-full max-w-[28rem] rounded-[2rem] border px-8 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${theme.overlayCard}`}>
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${theme.softCard}`}>
              <div
                className={`h-10 w-10 rounded-full border-2 ${
                  hasBackendIssue || hasModelIssue
                    ? theme.overlaySpinnerError
                    : theme.overlaySpinnerIdle
                } animate-spin`}
              />
            </div>
            <div className={`mt-6 text-[10px] uppercase tracking-[0.42em] ${theme.eyebrow}`}>Nur</div>
            <div className={`mt-3 text-[1.85rem] font-semibold leading-none ${theme.title}`}>
              {overlayTitle()}
            </div>
            <div className={`mt-4 text-sm leading-6 ${theme.muted}`}>{overlayHint()}</div>
            {overlaySupportingCopy() && (
              <div className={`mt-2 text-sm leading-6 ${theme.subtle}`}>{overlaySupportingCopy()}</div>
            )}
            {diagnosticMessage && (
              <div className={`mt-5 rounded-2xl border px-4 py-3 text-left text-xs leading-5 ${theme.overlayMessage}`}>
                {diagnosticMessage}
              </div>
            )}
            {isPreparingPiper && (
              <div className={`mt-6 h-1.5 w-full overflow-hidden rounded-full ${theme.overlayProgressTrack}`}>
                <div
                  className={`h-full rounded-full transition-all duration-300 ${theme.overlayProgressFill}`}
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
            )}
            {hasOverlayActions && (
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                {showRetryAction && (
                  <button
                    onClick={onRetry}
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${theme.primaryButton}`}
                  >
                    {hasBackendIssue ? 'Restart Engine' : 'Try Again'}
                  </button>
                )}
                {showPiperShortcut && (
                  <button
                    onClick={onUsePiper}
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${theme.secondaryButton}`}
                  >
                    Use Piper Instead
                  </button>
                )}
                {showRevealLogs && (
                  <button
                    onClick={onRevealLogs}
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${theme.secondaryButton}`}
                  >
                    Reveal Logs
                  </button>
                )}
                {showOpenSettings && (
                  <Link
                    to="/settings"
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${theme.secondaryButton}`}
                  >
                    Open Settings
                  </Link>
                )}
              </div>
            )}
            {!diagnosticMessage && !isPreparingPiper && (
              <div className={`mt-6 text-xs tracking-[0.08em] ${theme.subtle}`}>
                This screen closes automatically when setup finishes.
              </div>
            )}
            {showDevVersion && (
              <div className={`mt-5 text-[11px] uppercase tracking-[0.2em] ${theme.subtle}`}>
                v{appVersion} dev
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function App(): React.JSX.Element {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const { engine, status } = useTtsStatus(800)
  const runtime = useRuntimeStatus(2500)

  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev)
  const selectedModel = getModelStatusForEngine(status, engine)
  const backendReady = isEngineReady(status, engine)

  useEffect(() => {
    if (!status.backendOk) return
    if (selectedModel.ready) return
    if (selectedModel.state !== 'missing') return
    window.api.ensureModel(engine).catch(() => {})
  }, [engine, selectedModel.ready, selectedModel.state, status.backendOk])

  const handleRetry = async () => {
    if (!status.backendOk) {
      await window.api.restartBackend()
      return
    }
    await window.api.ensureModel(engine)
  }

  const handleUsePiper = async () => {
    setStoredTtsEngine('piper')
    await window.api.ensureModel('piper')
  }

  const handleRevealLogs = async () => {
    await window.api.revealLogs()
  }

  return (
    <Router>
      <AppFrame
        collapsed={isSidebarCollapsed}
        engine={engine}
        backendReady={backendReady}
        backendOk={status.backendOk}
        backendState={status.backendState}
        appVersion={runtime.diagnostics.appVersion}
        packaged={runtime.diagnostics.packaged}
        statusMessage={status.backendMessage}
        backendMessage={runtime.diagnostics.backendMessage}
        progress={selectedModel.progress}
        selectedModelState={selectedModel.state}
        selectedModelMessage={selectedModel.message}
        onToggleSidebar={toggleSidebar}
        onRetry={handleRetry}
        onRevealLogs={handleRevealLogs}
        onUsePiper={handleUsePiper}
      />
    </Router>
  )
}

export default App
