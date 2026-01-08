import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useLibrary } from '../../hooks/useLibrary'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
}

const navClass = (isActive: boolean, collapsed: boolean) =>
  `flex items-center gap-3 rounded-2xl transition-all duration-200 text-sm font-medium ${
    collapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'
  } ${
    isActive
      ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
  }`

const navItems = [
  { path: '/', label: 'My Library', short: 'L' },
  { path: '/voice-market', label: 'Voice Market', short: 'V' },
  { path: '/downloads', label: 'Downloads', short: 'D' },
  { path: '/settings', label: 'Settings', short: 'S' }
]

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { library } = useLibrary()

  const isLibraryActive = location.pathname === '/' || location.pathname.startsWith('/read/')

  return (
    <aside
      className={`flex-shrink-0 bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col p-5 gap-6 z-20 ${
        collapsed ? 'w-20' : 'w-72'
      }`}
      aria-label="Sidebar"
    >
      <div className="flex items-center justify-between px-2">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
        </div>
        {!collapsed && (
          <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">Nur</div>
        )}
      </div>

      <nav className="flex flex-col gap-2 mt-4">
        <button
          onClick={onToggleCollapse}
          className={`rounded-2xl border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 ${
            collapsed ? 'px-2 py-3' : 'px-4 py-3'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>' : 'Collapse'}
        </button>
        {navItems.map((item) => {
          const isActive =
            item.path === '/' ? isLibraryActive : location.pathname.startsWith(item.path)
          const content = collapsed ? (
            <span aria-hidden="true" className="text-sm font-semibold">
              {item.short}
            </span>
          ) : (
            item.label
          )

          if (item.path === '/') {
            return (
              <button
                key={item.path}
                onClick={() => navigate('/')}
                className={navClass(isActive, collapsed)}
                aria-label={item.label}
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
