import { useState } from 'react'
import Navbar from './components/navbar/Navbar'

/* Navbar Icons */

import { RiBookShelfLine } from 'react-icons/ri'
import { TiMicrophoneOutline } from 'react-icons/ti'
import { TbSettings } from 'react-icons/tb'
import { PiDownloadSimple } from 'react-icons/pi'

/* Pages */
import Library from './components/pages/library/Library'
import Voice from './components/pages/voice/Voice'
import Settings from './components/pages/settings/Settings'
import Downloads from './components/pages/downloads/Downloads'

function App(): React.JSX.Element {
  const navLinks = [
    { key: 'library', value: 'Library', icon: <RiBookShelfLine /> },
    { key: 'voiceMarket', value: 'Voice Market', icon: <TiMicrophoneOutline /> },
    { key: 'settings', value: 'Settings', icon: <TbSettings /> },
    { key: 'downloads', value: 'Downloads', icon: <PiDownloadSimple /> }
  ]

  const [selectedNav, setSelectedNav] = useState<string>(navLinks[0].value)

  const renderPage = (): React.JSX.Element => {
    switch (selectedNav) {
      case 'Library':
        return <Library />
      case 'Voice Market':
        return <Voice />
      case 'Settings':
        return <Settings />
      case 'Downloads':
        return <Downloads />
      default:
        return <Library />
    }
  }

  return (
    <div className="min-h-screen flex">
      <Navbar navLinks={navLinks} selectedNav={selectedNav} setSelectedNav={setSelectedNav} />
      {/* Main Content */}
      <div className="bg-red-600 min-h-screen w-full">{renderPage()}</div>
    </div>
  )
}

export default App
