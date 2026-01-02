import React from 'react'

interface BookViewerProps {
  bookStructure: { allSentences: string[]; sentenceToPageMap: number[] }
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
  const pageSentences = bookStructure.allSentences
    .map((text, idx) => ({ text, idx }))
    .filter((item) => bookStructure.sentenceToPageMap[item.idx] === visualPageIndex)

  if (pageSentences.length === 0) {
    return <div className="text-gray-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    <div className="leading-relaxed text-lg text-gray-300 font-serif">
      {pageSentences.map((item, localIdx) => {
        const imgMatch = item.text.match(/\[\[\[IMG_MARKER:(.*?)\]\]\]/)

        if (imgMatch) {
          const src = imgMatch[1]
          return (
            <div
              key={localIdx}
              className={`my-6 flex justify-center p-2 rounded transition-all duration-500 ${item.idx === globalSentenceIndex ? 'bg-indigo-900/30 ring-2 ring-indigo-500' : ''}`}
            >
              <img
                src={src}
                alt="Illustration"
                className="max-w-full max-h-[500px] rounded shadow-lg"
              />
            </div>
          )
        }

        return (
          <span
            key={localIdx}
            className={`transition-all duration-300 px-1 rounded ${
              item.idx === globalSentenceIndex && isPlaying
                ? 'bg-indigo-600/40 text-white shadow-sm box-decoration-clone'
                : ''
            }`}
          >
            {item.text}{' '}
          </span>
        )
      })}
    </div>
  )
}
