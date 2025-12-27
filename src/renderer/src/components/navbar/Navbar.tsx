type NavLinks = {
  key: string
  value: string
  icon?: React.JSX.Element
}

export default function Navbar({
  navLinks,
  selectedNav,
  setSelectedNav
}: {
  navLinks: NavLinks[]
  selectedNav: string
  setSelectedNav: (nav: string) => void
}): React.JSX.Element {
  const mockRecentReads = [
    { title: 'Book One', author: 'Author A' },
    { title: 'Book Two', author: 'Author B' },
    { title: 'Book Three', author: 'Author C' }
  ]

  const isDownloading = true // Mock downloading state

  return (
    <div className="min-h-screen md:w-64 w-[20%] bg-neutral-500">
      {/* Navbar*/}
      <ul className="p-4">
        {navLinks.map(({ key, value, icon }) => (
          <li key={key} className="mb-2">
            <button
              onClick={() => setSelectedNav(value)}
              className={`w-full text-left px-4 py-2 rounded cursor-pointer flex gap-2 items-center justify-center${
                selectedNav === value
                  ? 'bg-neutral-700 text-white'
                  : 'text-white hover:bg-neutral-700'
              }`}
            >
              <span>{icon}</span>
              <span className="md:flex hidden">{value}</span>
            </button>
          </li>
        ))}
      </ul>
      {/* Downloading Indicator */}
      {isDownloading && (
        <div className="bg-yellow-500 text-black p-2 m-4 rounded text-center overflow-hidden">
          Downloading...
        </div>
      )}
      {/* Recent Reads */}
      <div className="flex flex-col gap-6">
        <h2 className="text-white text-lg px-4">Recent Reads</h2>
        <div className="flex flex-col gap-4 px-4">
          {mockRecentReads.map((book, index) => (
            <div key={index} className="bg-neutral-600 text-white p-2 rounded">
              <h3 className="font-semibold">{book.title}</h3>
              <p className="text-sm">{book.author}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
