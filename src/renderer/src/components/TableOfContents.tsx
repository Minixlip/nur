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
    <div className="absolute inset-0 bg-gray-900/95 z-50 flex flex-col backdrop-blur-sm animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-700">
        <h2 className="text-2xl font-bold text-white tracking-wide">Contents</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-gray-600">
        {items.length === 0 && (
          <div className="text-gray-500 text-center mt-10">No Table of Contents found</div>
        )}

        {items.map((item, idx) => {
          // Is this the active chapter?
          // We check if the current page is >= this chapter's start, but < next chapter's start
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
              className={`
                                w-full text-left px-6 py-4 rounded-lg text-lg transition-all duration-200 font-serif
                                ${
                                  isActive
                                    ? 'bg-indigo-600/20 text-indigo-300 border-l-4 border-indigo-500 font-semibold'
                                    : 'text-gray-300 hover:bg-gray-800 hover:pl-8 border-l-4 border-transparent'
                                }
                            `}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
