import { HashRouter as Router, Routes, Route } from 'react-router-dom'
/* Pages */
import LibraryLayout from './components/pages/library/Library'
import LibraryReader from './components/pages/library/LibraryReader'
import LibraryShelf from './components/pages/library/LibraryShelf'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'
import Downloads from './components/pages/downloads/Downloads'

function App(): React.JSX.Element {
  return (
    <Router>
      <div className="min-h-screen flex">
        {/* Main Content */}
        <div className="bg-red-600 min-h-screen w-full">
          <Routes>
            <Route path="/" element={<LibraryLayout />}>
              <Route index element={<LibraryShelf />} />
              <Route path="reader/:bookId" element={<LibraryReader />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="/voice-market" element={<Voice />} />
            <Route path="/downloads" element={<Downloads />} />
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
