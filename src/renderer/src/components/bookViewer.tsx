import React from 'react'
import { VisualBlock } from '../hooks/useBookImporter'

interface BookViewerProps {
  bookStructure: {
    allSentences: string[]
    sentenceToPageMap: number[]
    pagesStructure: VisualBlock[][]
  }
  visualPageIndex: number
  globalSentenceIndex: number
  isPlaying: boolean
}

export const BookViewer: React.FC<BookViewerProps> = ({
  bookStructure,
  visualPageIndex,
  globalSentenceIndex,
  isPlaying
}) => {
  const pageBlocks = bookStructure.pagesStructure[visualPageIndex]

  if (!pageBlocks || pageBlocks.length === 0) {
    return <div className="text-gray-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    // Added min-h to prevent layout shift
    <div className="max-w-3xl mx-auto min-h-[60vh] flex flex-col justify-start">
      {pageBlocks.map((block, blockIdx) => {
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
