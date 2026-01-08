import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useLibrary } from '../../hooks/useLibrary'

const navClass = (isActive: boolean) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
    isActive
      ? 'bg-white/10 text-white shadow-inner'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
  }`

export default function Sidebar(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { library } = useLibrary()

  const isLibraryActive = location.pathname === '/' || location.pathname.startsWith('/read/')

  return (
    <aside className="w-64 flex-shrink-0 bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col p-4 gap-6 z-20">
      <div className="flex gap-2 px-2">
        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
        <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
      </div>

      <nav className="flex flex-col gap-2 mt-4">
        <button onClick={() => navigate('/')} className={navClass(isLibraryActive)}>
          My Library
        </button>
        <NavLink to="/voice-market" className={({ isActive }) => navClass(isActive)}>
          Voice Market
        </NavLink>
        <NavLink to="/downloads" className={({ isActive }) => navClass(isActive)}>
          Downloads
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}>
          Settings
        </NavLink>
      </nav>

      <div className="mt-auto">
        <h4 className="px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
          Recent Reads
        </h4>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {library.slice(0, 3).map((book) => (
            <div
              key={book.id}
              onClick={() => navigate(`/read/${book.id}`)}
              className="w-12 h-16 bg-zinc-800 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition flex-shrink-0 border border-white/10"
            >
              {book.cover ? (
                <img src={book.cover} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs">Book</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
