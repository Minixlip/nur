import React from 'react'
import { VisualBlock, TocItem } from '../types/book'
import { ReaderSettings } from '../hooks/useReaderSettings'

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
  settings: ReaderSettings
}

export const BookViewer: React.FC<BookViewerProps> = ({
  bookStructure,
  visualPageIndex,
  globalSentenceIndex,
  isPlaying,
  onChapterClick,
  settings
}) => {
  const pageBlocks = bookStructure.pagesStructure[visualPageIndex]

  // Font Family: Merriweather is great for books
  const getFontFamily = () => {
    switch (settings.fontFamily) {
      case 'serif':
        return 'font-serif' // Ensure your Tailwind config has a good serif stack
      case 'mono':
        return 'font-mono'
      default:
        return 'font-sans'
    }
  }

  const getThemeTextClass = () => {
    switch (settings.theme) {
      case 'light':
        return 'text-zinc-800'
      case 'sepia':
        return 'text-[#433422]'
      default:
        return 'text-zinc-300' // Softer than pure white
    }
  }

  const getHighlightClass = () => {
    switch (settings.theme) {
      case 'light':
        return 'bg-yellow-200/50 text-black decoration-clone'
      case 'sepia':
        return 'bg-[#e3d0a6] text-black decoration-clone'
      default:
        return 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] rounded decoration-clone' // Subtle glow
    }
  }

  if (!pageBlocks || pageBlocks.length === 0) {
    return <div className="text-zinc-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    <div
      className={`w-full max-w-5xl mx-auto px-2 md:px-8 min-h-[60vh] flex flex-col justify-start transition-all duration-300 ease-in-out`}
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
              className={`my-8 flex justify-center transition-all duration-700 ${isHighlight ? 'scale-105 contrast-125' : 'opacity-90'}`}
            >
              <img
                src={src}
                alt="Illustration"
                className="max-w-full rounded-lg shadow-2xl object-contain"
              />
            </div>
          )
        }

        const blockText = block.content.join(' ').trim()
        const tocMatch = bookStructure.processedToc?.find(
          (item) => item.label.trim().toLowerCase() === blockText.toLowerCase()
        )

        // 2. CHAPTER TITLE (Link)
        if (tocMatch) {
          return (
            <button
              key={blockIdx}
              onClick={() => onChapterClick(tocMatch.pageIndex)}
              className="w-full text-left mt-8 mb-6 group"
            >
              <span
                className={`text-3xl md:text-4xl font-bold tracking-tight transition-colors ${
                  settings.theme === 'dark'
                    ? 'text-zinc-100 group-hover:text-white'
                    : 'text-zinc-900 group-hover:text-black'
                } ${getFontFamily()}`}
              >
                {blockText}
              </span>
            </button>
          )
        }

        // 3. PARAGRAPH
        return (
          <p
            key={blockIdx}
            className={`mb-6 text-lg md:text-xl leading-relaxed transition-all duration-300 ${getFontFamily()} ${getThemeTextClass()}`}
            style={{
              fontSize: `${settings.fontSize}%`,
              lineHeight: settings.lineHeight
            }}
          >
            {block.content.map((sentence, localIdx) => {
              const myGlobalIndex = block.startIndex + localIdx
              const isCurrent = myGlobalIndex === globalSentenceIndex

              return (
                <span
                  key={localIdx}
                  data-current-sentence={isCurrent ? 'true' : undefined}
                  className={`transition-colors duration-300 px-0.5 rounded-sm ${
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
