import { useEffect, useState } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'

/* Pages */
import Library from './components/pages/library/Library'
import Reader from './components/pages/reader/Reader'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'

function App(): React.JSX.Element {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [backendReady, setBackendReady] = useState(false)
  const [backendHint, setBackendHint] = useState('Starting Nur engine...')

  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev)

  useEffect(() => {
    let isMounted = true
    let attempts = 0
    let intervalId: number | undefined

    const checkBackend = async () => {
      try {
        const status = await window.api.checkBackend()
        if (!isMounted) return false
        if (!status.ok) {
          setBackendHint('Starting Nur engine...')
          return false
        }
        if (!status.ttsReady) {
          setBackendHint('Loading speech models...')
          return false
        }
        setBackendReady(true)
        return true
      } catch (err) {}
      return false
    }

    const startPolling = async () => {
      const immediate = await checkBackend()
      if (immediate) return

      intervalId = window.setInterval(async () => {
        attempts += 1
        if (attempts === 10 && isMounted) {
          setBackendHint('Warming up models... this can take a minute.')
        }
        const ready = await checkBackend()
        if (ready) {
          if (intervalId) {
            window.clearInterval(intervalId)
          }
        }
      }, 750)
    }

    startPolling()

    return () => {
      isMounted = false
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [])

  return (
    <Router>
      <div className="relative flex h-screen overflow-hidden text-zinc-100">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 right-[-5%] h-[420px] w-[520px] rounded-full bg-zinc-700/20 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_55%)]" />

        <div className="relative z-10 flex h-full w-full">
          <Sidebar collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />
          <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-zinc-950/30 backdrop-blur-2xl border-l border-white/5">
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/read/:bookId" element={<Reader />} />
              <Route path="/voice-market" element={<Voice />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>

        {!backendReady && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/80 backdrop-blur-2xl">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-8 py-6 text-center shadow-[0_20px_60px_-40px_rgba(0,0,0,0.8)]">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300" />
              <div className="text-sm uppercase tracking-[0.3em] text-white/60">NUR</div>
              <div className="text-lg font-semibold text-zinc-100">Preparing your reader</div>
              <div className="text-sm text-zinc-400">{backendHint}</div>
            </div>
          </div>
        )}
      </div>
    </Router>
  )
}

export default App
