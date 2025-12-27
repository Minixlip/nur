import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/navbar/Navbar'

/* Pages */
import Library from './components/pages/library/Library'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'
import Downloads from './components/pages/downloads/Downloads'

function App(): React.JSX.Element {
  return (
    <Router>
      <div className="min-h-screen flex">
        {/* Navbar now uses <Link> or navigate() internally */}
        <Navbar />

        {/* Main Content */}
        <div className="bg-red-600 min-h-screen w-full">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/voice-market" element={<Voice />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/downloads" element={<Downloads />} />
            {/* Future Route: <Route path="/read/:bookId" element={<Reader />} /> */}
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
