import { NavLink } from 'react-router-dom'
/* Icons */
import { RiBookShelfLine } from 'react-icons/ri'
import { TiMicrophoneOutline } from 'react-icons/ti'
import { TbSettings } from 'react-icons/tb'
import { PiDownloadSimple } from 'react-icons/pi'

export default function Navbar(): React.JSX.Element {
  // 1. Define links here (or import from a config file)
  const navLinks = [
    { path: '/', label: 'Library', icon: <RiBookShelfLine /> },
    { path: '/voice-market', label: 'Voice Market', icon: <TiMicrophoneOutline /> },
    { path: '/downloads', label: 'Downloads', icon: <PiDownloadSimple /> },
    { path: '/settings', label: 'Settings', icon: <TbSettings /> }
  ]

  const mockRecentReads = [
    { title: 'Book One', author: 'Author A' },
    { title: 'Book Two', author: 'Author B' }
  ]

  return (
    <div className="min-h-screen md:w-64 w-[20%] bg-neutral-500 flex flex-col">
      {/* 2. Navigation Links */}
      <ul className="p-4 flex-1">
        {navLinks.map(({ path, label, icon }) => (
          <li key={path} className="mb-2">
            <NavLink
              to={path}
              className={({ isActive }) =>
                `w-full text-left px-4 py-2 rounded cursor-pointer flex gap-2 items-center justify-center md:justify-start ${
                  isActive
                    ? 'bg-neutral-700 text-white' // Active Style
                    : 'text-white hover:bg-neutral-700' // Inactive Style
                }`
              }
            >
              <span className="text-xl">{icon}</span>
              <span className="md:block hidden">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* 3. Footer / Recent Reads (kept from your original design) */}
      <div className="flex flex-col gap-6 pb-6">
        <h2 className="text-white text-lg px-4 hidden md:block">Recent Reads</h2>
        <div className="flex flex-col gap-4 px-4">
          {mockRecentReads.map((book, index) => (
            <div key={index} className="bg-neutral-600 text-white p-2 rounded hidden md:block">
              <h3 className="font-semibold text-sm">{book.title}</h3>
              <p className="text-xs text-gray-300">{book.author}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
