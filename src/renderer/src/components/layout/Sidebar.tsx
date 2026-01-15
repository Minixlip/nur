import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { RiBookShelfLine } from 'react-icons/ri'
import { TiMicrophoneOutline } from 'react-icons/ti'
import { TbSettings } from 'react-icons/tb'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useLibrary } from '../../hooks/useLibrary'
import Tooltip from '../ui/Tooltip'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

const navClass = (isActive: boolean, collapsed: boolean) =>
  `w-full flex items-center gap-3 rounded-2xl transition-all duration-300 text-sm font-medium ${
    collapsed ? 'justify-center px-2 py-3.5' : 'px-4 py-3.5'
  } ${
    isActive
      ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
  }`

const navItems = [
  { path: '/', label: 'My Library', icon: <RiBookShelfLine className="text-lg" /> },
  { path: '/voice-market', label: 'Voice Studio', icon: <TiMicrophoneOutline className="text-lg" /> },
  { path: '/settings', label: 'Settings', icon: <TbSettings className="text-lg" /> }
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
            collapsed ? 'text-[10px] tracking-[0.2em] hidden' : 'text-xs tracking-[0.35em]'
          }`}
        >
          Nur
        </div>
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <button
              onClick={onToggleCollapse}
              className={`rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                collapsed ? 'h-7 w-7' : 'h-8 w-8'
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
          </button>
        </Tooltip>
      </div>

      <nav className="flex flex-col gap-2 mt-4 flex-none">
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
              <Tooltip key={item.path} label={item.label} className="w-full">
                <button
                  onClick={() => navigate('/')}
                  className={navClass(isActive, collapsed)}
                  aria-label={item.label}
                  style={{ transitionDelay: revealDelay }}
                >
                  {content}
                  {collapsed && <span className="sr-only">{item.label}</span>}
                </button>
              </Tooltip>
            )
          }

          return (
            <Tooltip key={item.path} label={item.label} className="w-full">
              <NavLink
                to={item.path}
                className={() => navClass(isActive, collapsed)}
                aria-label={item.label}
                style={{ transitionDelay: revealDelay }}
              >
                {content}
                {collapsed && <span className="sr-only">{item.label}</span>}
              </NavLink>
            </Tooltip>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="mt-6 flex-1 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] flex flex-col min-h-0">
          <div className="flex items-center justify-between px-1 mb-3">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              Recent Reads
            </h4>
            <span className="text-[10px] text-zinc-500">{library.length} total</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              {library.slice(0, 8).map((book) => (
                <button
                  key={book.id}
                  onClick={() => navigate(`/read/${book.id}`)}
                  className="group rounded-xl border border-white/10 bg-white/5 overflow-hidden cursor-pointer transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 shadow-sm"
                  aria-label={`Open ${book.title}`}
                >
                  <div className="relative aspect-[2/3]">
                    {book.cover ? (
                      <img src={book.cover} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 bg-zinc-800/60">
                        Book
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] uppercase tracking-wide text-white/90">
                        Open
                      </span>
                    </div>
                  </div>
                  <div className="px-2 py-2 text-left">
                    <div className="text-[11px] text-zinc-200 truncate">{book.title}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
