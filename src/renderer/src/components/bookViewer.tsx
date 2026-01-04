import React from 'react'
import { VisualBlock, TocItem } from '../types/book'
import { ReaderSettings } from '../hooks/useReaderSettings' // <--- IMPORT TYPE

interface BookViewerProps {
  bookStructure: {
    allSentences: string[]
    sentenceToPageMap: number[]
    pagesStructure: VisualBlock[][]
    processedToc?: TocItem[]
  }
  visualPageIndex: number
  globalSentenceIndex: number
  isPlaying: boolean
  onChapterClick: (pageIndex: number) => void
  settings: ReaderSettings // <--- NEW PROP
}

export const BookViewer: React.FC<BookViewerProps> = ({
  bookStructure,
  visualPageIndex,
  globalSentenceIndex,
  isPlaying,
  onChapterClick,
  settings // Destructure settings
}) => {
  const pageBlocks = bookStructure.pagesStructure[visualPageIndex]

  // Helper: Font Family Class
  const getFontFamily = () => {
    switch (settings.fontFamily) {
      case 'serif':
        return 'font-serif'
      case 'mono':
        return 'font-mono'
      default:
        return 'font-sans'
    }
  }

  // Helper: Theme Colors (Text & Highlights)
  // Note: Background is handled by the parent container in Library.tsx
  const getThemeTextClass = () => {
    switch (settings.theme) {
      case 'light':
        return 'text-gray-900'
      case 'sepia':
        return 'text-[#5b4636]'
      default:
        return 'text-gray-300' // Dark mode text
    }
  }

  const getHighlightClass = () => {
    switch (settings.theme) {
      case 'light':
        return 'bg-yellow-200 text-black shadow-sm'
      case 'sepia':
        return 'bg-[#e3d0a6] text-black shadow-sm'
      default:
        return 'bg-indigo-600 text-white shadow-sm' // Dark mode highlight
    }
  }

  if (!pageBlocks || pageBlocks.length === 0) {
    return <div className="text-gray-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    <div
      className={`max-w-3xl mx-auto min-h-[60vh] flex flex-col justify-start pb-20 transition-all duration-300`}
    >
      {pageBlocks.map((block, blockIdx) => {
        // 1. IMAGE BLOCK
        if (block.type === 'image') {
          const srcMatch = block.content[0].match(/\[\[\[IMG_MARKER:(.*?)\]\]\]/)
          const src = srcMatch ? srcMatch[1] : ''
          const isHighlight = globalSentenceIndex === block.startIndex

          return (
            <div
              key={blockIdx}
              className={`my-6 flex justify-center p-2 rounded-lg transition-all duration-500 ${
                isHighlight ? 'ring-2 ring-indigo-500 opacity-100 scale-105' : 'opacity-90'
              }`}
            >
              <img
                src={src}
                alt="Illustration"
                className="max-w-full max-h-125 rounded shadow-lg object-contain bg-black/20"
              />
            </div>
          )
        }

        // 2. TEXT BLOCK (PARAGRAPH)
        const blockText = block.content.join(' ').trim()

        // CHECK: Is this paragraph actually a Chapter Title from the Table of Contents?
        const tocMatch = bookStructure.processedToc?.find(
          (item) => item.label.trim().toLowerCase() === blockText.toLowerCase()
        )

        // 3. RENDER AS LINK (If match found)
        if (tocMatch) {
          return (
            <button
              key={blockIdx}
              onClick={() => onChapterClick(tocMatch.pageIndex)}
              className="w-full text-left mb-6 group mt-4"
            >
              <span
                className={`text-2xl font-bold hover:underline decoration-indigo-500/50 underline-offset-4 transition-all block py-2 ${
                  settings.theme === 'dark'
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-indigo-600 hover:text-indigo-700'
                }`}
              >
                {blockText}
              </span>
            </button>
          )
        }

        // 4. RENDER AS STANDARD TEXT
        return (
          <p
            key={blockIdx}
            className={`mb-4 text-justify transition-all duration-300 ${getFontFamily()} ${getThemeTextClass()}`}
            style={{
              fontSize: `${settings.fontSize}%`,
              lineHeight: settings.lineHeight
            }}
          >
            {block.content.map((sentence, localIdx) => {
              const myGlobalIndex = block.startIndex + localIdx
              const isCurrent = myGlobalIndex === globalSentenceIndex && isPlaying

              return (
                <span
                  key={localIdx}
                  className={`transition-colors duration-200 box-decoration-clone rounded px-0.5 ${
                    isCurrent ? getHighlightClass() : ''
                  }`}
                >
                  {sentence}{' '}
                </span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}
