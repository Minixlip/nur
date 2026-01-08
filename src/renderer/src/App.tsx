import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'

/* Pages */
import Library from './components/pages/library/Library'
import Reader from './components/pages/reader/Reader'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'
import Downloads from './components/pages/downloads/Downloads'

function App(): React.JSX.Element {
  return (
    <Router>
      <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-indigo-500/30">
        <Sidebar />
        <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/read/:bookId" element={<Reader />} />
            <Route path="/voice-market" element={<Voice />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/downloads" element={<Downloads />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
