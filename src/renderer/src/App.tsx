import { useState } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'

/* Pages */
import Library from './components/pages/library/Library'
import Reader from './components/pages/reader/Reader'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'
import Downloads from './components/pages/downloads/Downloads'

function App(): React.JSX.Element {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const toggleSidebar = () => setIsSidebarCollapsed((prev) => !prev)

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
              <Route path="/read/:bookId" element={<Reader onToggleSidebar={toggleSidebar} />} />
              <Route path="/voice-market" element={<Voice />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/downloads" element={<Downloads />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  )
}

export default App
