import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { RiBookShelfLine } from 'react-icons/ri'
import { TiMicrophoneOutline } from 'react-icons/ti'
import { TbSettings } from 'react-icons/tb'
import { PiDownloadSimple } from 'react-icons/pi'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useLibrary } from '../../hooks/useLibrary'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

const navClass = (isActive: boolean, collapsed: boolean) =>
  `flex items-center gap-3 rounded-2xl transition-all duration-300 text-sm font-medium ${
    collapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'
  } ${
    isActive
      ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
  }`

const navItems = [
  { path: '/', label: 'My Library', icon: <RiBookShelfLine className="text-lg" /> },
  { path: '/voice-market', label: 'Voice Market', icon: <TiMicrophoneOutline /> },
  { path: '/downloads', label: 'Downloads', icon: <PiDownloadSimple /> },
  { path: '/settings', label: 'Settings', icon: <TbSettings /> }
]

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { library } = useLibrary()

  const isLibraryActive = location.pathname === '/' || location.pathname.startsWith('/read/')

  return (
    <aside
      className={`flex-shrink-0 overflow-hidden bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col p-5 gap-6 z-20 transition-[width] duration-300 ${
        collapsed ? 'w-20' : 'w-72'
      }`}
      aria-label="Sidebar"
    >
      <div className={`flex items-center justify-between ${collapsed ? 'px-1' : 'px-2'}`}>
        <div
          className={`uppercase text-zinc-500 ${
            collapsed ? 'text-[10px] tracking-[0.2em] truncate' : 'text-xs tracking-[0.35em]'
          }`}
        >
          Nur
        </div>
        <button
          onClick={onToggleCollapse}
          className={`rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 flex items-center justify-center ${
            collapsed ? 'h-7 w-7' : 'h-8 w-8'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
        </button>
      </div>

      <nav className="flex flex-col gap-2 mt-4">
        {navItems.map((item) => {
          const isActive =
            item.path === '/' ? isLibraryActive : location.pathname.startsWith(item.path)
          const content = collapsed ? (
            <span aria-hidden="true" className="text-lg">
              {item.icon}
            </span>
          ) : (
            <>
              <span className="text-lg">{item.icon}</span>
              <span
                className={`transition-all duration-300 ${
                  collapsed ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'
                }`}
              >
                {item.label}
              </span>
            </>
          )
          const revealDelay = collapsed ? '0ms' : `${120 + navItems.indexOf(item) * 60}ms`

          if (item.path === '/') {
            return (
              <button
                key={item.path}
                onClick={() => navigate('/')}
                className={navClass(isActive, collapsed)}
                aria-label={item.label}
                style={{ transitionDelay: revealDelay }}
              >
                {content}
                {collapsed && <span className="sr-only">{item.label}</span>}
              </button>
            )
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={() => navClass(isActive, collapsed)}
              aria-label={item.label}
              style={{ transitionDelay: revealDelay }}
            >
              {content}
              {collapsed && <span className="sr-only">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
          <h4 className="px-1 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
            Recent Reads
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {library.slice(0, 3).map((book) => (
              <button
                key={book.id}
                onClick={() => navigate(`/read/${book.id}`)}
                className="w-12 h-16 bg-zinc-800/80 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition flex-shrink-0 border border-white/10 shadow-sm"
                aria-label={`Open ${book.title}`}
              >
                {book.cover ? (
                  <img src={book.cover} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400">
                    Book
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
