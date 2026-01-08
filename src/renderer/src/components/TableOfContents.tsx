import React from 'react'
import { TocItem } from '../hooks/useBookImporter'

interface TocProps {
  items: TocItem[]
  onChapterClick: (pageIndex: number) => void
  currentVisualPage: number
  isOpen: boolean
  onClose: () => void
}

export const TableOfContents: React.FC<TocProps> = ({
  items,
  onChapterClick,
  currentVisualPage,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-2xl animate-fade-in">
      <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
        <h2 className="text-xl font-semibold text-white tracking-wide">Contents</h2>
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
          aria-label="Close table of contents"
        >
          X
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-white/20">
        {items.length === 0 && (
          <div className="text-zinc-500 text-center mt-10">No table of contents found.</div>
        )}

        {items.map((item, idx) => {
          const nextItem = items[idx + 1]
          const isActive =
            currentVisualPage >= item.pageIndex &&
            (!nextItem || currentVisualPage < nextItem.pageIndex)

          return (
            <button
              key={idx}
              onClick={() => {
                onChapterClick(item.pageIndex)
                onClose()
              }}
              className={`w-full text-left px-5 py-3 rounded-xl text-base transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                  : 'text-zinc-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="truncate">{item.label}</span>
                <span className="text-xs text-zinc-500">{item.pageIndex + 1}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
