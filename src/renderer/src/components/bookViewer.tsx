import React from 'react'
import { VisualBlock, TocItem } from '../hooks/useBookImporter'

interface BookViewerProps {
  bookStructure: {
    allSentences: string[]
    sentenceToPageMap: number[]
    pagesStructure: VisualBlock[][]
    processedToc?: TocItem[] // Add ToC to the data we receive
  }
  visualPageIndex: number
  globalSentenceIndex: number
  isPlaying: boolean
  onChapterClick: (pageIndex: number) => void // New Handler
}

export const BookViewer: React.FC<BookViewerProps> = ({
  bookStructure,
  visualPageIndex,
  globalSentenceIndex,
  isPlaying,
  onChapterClick
}) => {
  const pageBlocks = bookStructure.pagesStructure[visualPageIndex]

  if (!pageBlocks || pageBlocks.length === 0) {
    return <div className="text-gray-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    <div className="max-w-3xl mx-auto min-h-[60vh] flex flex-col justify-start">
      {pageBlocks.map((block, blockIdx) => {
        // 1. IMAGE BLOCK
        if (block.type === 'image') {
          const srcMatch = block.content[0].match(/\[\[\[IMG_MARKER:(.*?)\]\]\]/)
          const src = srcMatch ? srcMatch[1] : ''
          const isHighlight = globalSentenceIndex === block.startIndex

          return (
            <div
              key={blockIdx}
              className={`my-6 flex justify-center p-2 rounded-lg transition-all duration-500 ${isHighlight ? 'bg-indigo-900/30 ring-2 ring-indigo-500' : ''}`}
            >
              <img
                src={src}
                alt="Illustration"
                className="max-w-full max-h-[500px] rounded shadow-lg object-contain"
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
              className="w-full text-left mb-4 group"
            >
              <span className="text-xl md:text-2xl text-indigo-400 font-serif font-medium hover:text-indigo-300 hover:underline decoration-indigo-500/50 underline-offset-4 transition-all block py-2">
                {blockText}
              </span>
            </button>
          )
        }

        // 4. RENDER AS STANDARD TEXT
        return (
          <p
            key={blockIdx}
            className="mb-6 leading-relaxed text-lg text-gray-300 font-serif text-justify"
          >
            {block.content.map((sentence, localIdx) => {
              const myGlobalIndex = block.startIndex + localIdx
              const isCurrent = myGlobalIndex === globalSentenceIndex && isPlaying

              return (
                <span
                  key={localIdx}
                  className={`
                                        transition-colors duration-200 
                                        ${isCurrent ? 'bg-indigo-600 text-white shadow-sm box-decoration-clone rounded px-0.5' : ''}
                                    `}
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
