import React, { memo, useMemo } from 'react'
import { TocItem, VisualBlock } from '../types/book'
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
  onChapterClick: (pageIndex: number) => void
  settings: ReaderSettings
  translatedParagraphs?: string[] | null
  translatedSentenceBlocks?: string[][] | null
  activeTranslatedSentenceIndex?: number | null
  showTranslatedText?: boolean
  translatedLanguageLabel?: string
  translatedIsRtl?: boolean
}

interface ParagraphBlockProps {
  block: VisualBlock
  activeSentenceLocalIndex: number | null
  fontFamilyClass: string
  themeTextClass: string
  highlightClass: string
  fontSize: number
  lineHeight: number
}

interface ImageBlockProps {
  src: string
  isHighlight: boolean
  frameClass: string
}

const normalizeTocLabel = (label: string): string => label.trim().toLowerCase()

const getFontFamilyClass = (fontFamily: ReaderSettings['fontFamily']): string => {
  switch (fontFamily) {
    case 'serif':
      return 'font-serif'
    case 'mono':
      return 'font-mono'
    default:
      return 'font-sans'
  }
}

const getThemeTextClass = (theme: ReaderSettings['theme']): string => {
  switch (theme) {
    case 'light':
      return 'text-zinc-800'
    case 'sepia':
      return 'text-[#433422]'
    default:
      return 'text-zinc-200'
  }
}

const getHighlightClass = (theme: ReaderSettings['theme']): string => {
  switch (theme) {
    case 'light':
      return 'bg-yellow-200/60 text-black decoration-clone shadow-[0_0_0_1px_rgba(0,0,0,0.04)]'
    case 'sepia':
      return 'bg-[#e3d0a6] text-black decoration-clone shadow-[0_0_0_1px_rgba(91,70,54,0.08)]'
    default:
      return 'bg-emerald-300/10 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.18)] rounded decoration-clone'
  }
}

const getImageFrameClass = (theme: ReaderSettings['theme']): string => {
  switch (theme) {
    case 'light':
      return 'border-black/10 bg-black/[0.03]'
    case 'sepia':
      return 'border-black/10 bg-black/[0.04]'
    default:
      return 'border-white/10 bg-white/[0.03]'
  }
}

const ParagraphBlock = memo(
  function ParagraphBlock({
    block,
    activeSentenceLocalIndex,
    fontFamilyClass,
    themeTextClass,
    highlightClass,
    fontSize,
    lineHeight
  }: ParagraphBlockProps): React.JSX.Element {
    return (
      <p
        className={`reader-paragraph mb-7 text-lg md:text-[1.34rem] leading-relaxed tracking-[0.005em] transition-all duration-300 ${fontFamilyClass} ${themeTextClass}`}
        style={{
          fontSize: `${fontSize}%`,
          lineHeight
        }}
      >
        {block.content.map((sentence, localIdx) => {
          const isCurrent = localIdx === activeSentenceLocalIndex

          return (
            <span
              key={localIdx}
              data-current-sentence={isCurrent ? 'true' : undefined}
              className={`transition-colors duration-300 px-0.5 rounded-sm ${
                isCurrent ? highlightClass : ''
              }`}
            >
              {sentence}{' '}
            </span>
          )
        })}
      </p>
    )
  },
  (prev, next) =>
    prev.block === next.block &&
    prev.activeSentenceLocalIndex === next.activeSentenceLocalIndex &&
    prev.fontFamilyClass === next.fontFamilyClass &&
    prev.themeTextClass === next.themeTextClass &&
    prev.highlightClass === next.highlightClass &&
    prev.fontSize === next.fontSize &&
    prev.lineHeight === next.lineHeight
)

const ImageBlock = memo(
  function ImageBlock({ src, isHighlight, frameClass }: ImageBlockProps): React.JSX.Element {
    return (
      <div
        className={`my-8 flex justify-center transition-all duration-700 ${
          isHighlight ? 'scale-105 contrast-125' : 'opacity-90'
        }`}
      >
        <div className={`overflow-hidden rounded-[28px] border p-3 shadow-2xl ${frameClass}`}>
          <img
            src={src}
            alt="Illustration"
            className="max-h-[70vh] max-w-full rounded-[22px] object-contain"
          />
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.src === next.src &&
    prev.isHighlight === next.isHighlight &&
    prev.frameClass === next.frameClass
)

export const BookViewer: React.FC<BookViewerProps> = ({
  bookStructure,
  visualPageIndex,
  globalSentenceIndex,
  onChapterClick,
  settings,
  translatedParagraphs,
  translatedSentenceBlocks,
  activeTranslatedSentenceIndex = null,
  showTranslatedText = false,
  translatedLanguageLabel,
  translatedIsRtl = false
}) => {
  const pageBlocks = bookStructure.pagesStructure[visualPageIndex]
  const fontFamilyClass = getFontFamilyClass(settings.fontFamily)
  const themeTextClass = getThemeTextClass(settings.theme)
  const highlightClass = getHighlightClass(settings.theme)
  const imageFrameClass = getImageFrameClass(settings.theme)
  const tocLabelToPageIndex = useMemo(() => {
    const lookup = new Map<string, number>()
    for (const item of bookStructure.processedToc || []) {
      lookup.set(normalizeTocLabel(item.label), item.pageIndex)
    }
    return lookup
  }, [bookStructure.processedToc])
  const translatedMetaClass =
    settings.theme === 'dark'
      ? 'border-white/10 bg-white/[0.04] text-zinc-300'
      : settings.theme === 'sepia'
        ? 'border-black/10 bg-black/[0.03] text-[#6a5a4a]'
        : 'border-black/10 bg-black/[0.03] text-zinc-600'
  const translatedBlocksToRender = useMemo(() => {
    const sourceBlocks =
      translatedSentenceBlocks && translatedSentenceBlocks.length > 0
        ? translatedSentenceBlocks
        : (translatedParagraphs || []).map((paragraph) => [paragraph])
    return sourceBlocks.reduce<Array<{ sentences: string[]; startIndex: number }>>(
      (blocks, sentences) => {
        const previousBlock = blocks[blocks.length - 1]
        const startIndex = previousBlock
          ? previousBlock.startIndex + previousBlock.sentences.length
          : 0

        return [
          ...blocks,
          {
            sentences,
            startIndex
          }
        ]
      },
      []
    )
  }, [translatedParagraphs, translatedSentenceBlocks])

  if (showTranslatedText) {
    if (!translatedParagraphs || translatedParagraphs.length === 0) {
      return (
        <div className="text-zinc-500 italic p-4 text-center mt-10">
          No translated text is available for this page yet.
        </div>
      )
    }

    return (
      <div
        className="reader-prose w-full mx-auto min-h-[60vh] px-4 md:px-8 transition-all duration-300 ease-in-out"
        style={{ maxWidth: 'clamp(640px, 70vw, 1040px)' }}
      >
        <div
          className={`mb-6 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] ${translatedMetaClass}`}
        >
          {translatedLanguageLabel ? `${translatedLanguageLabel} Translation` : 'Translation'}
        </div>
        <div
          dir={translatedIsRtl ? 'rtl' : undefined}
          className={translatedIsRtl ? 'text-right' : ''}
        >
          {translatedBlocksToRender.map(({ sentences, startIndex }, paragraphIndex) => (
            <p
              key={`translated-${paragraphIndex}`}
              className={`reader-paragraph mb-7 text-lg md:text-[1.34rem] leading-relaxed tracking-[0.005em] transition-all duration-300 ${fontFamilyClass} ${themeTextClass}`}
              style={{
                fontSize: `${settings.fontSize}%`,
                lineHeight: settings.lineHeight
              }}
            >
              {sentences.map((sentence, sentenceIndex) => {
                const globalIndex = startIndex + sentenceIndex
                const isCurrent = activeTranslatedSentenceIndex === globalIndex

                return (
                  <span
                    key={`translated-sentence-${paragraphIndex}-${sentenceIndex}`}
                    data-current-sentence={isCurrent ? 'true' : undefined}
                    className={`transition-colors duration-300 px-0.5 rounded-sm ${
                      isCurrent ? highlightClass : ''
                    }`}
                  >
                    {sentence}{' '}
                  </span>
                )
              })}
            </p>
          ))}
        </div>
      </div>
    )
  }

  if (!pageBlocks || pageBlocks.length === 0) {
    return <div className="text-zinc-500 italic p-4 text-center mt-10">Empty Page</div>
  }

  return (
    <div
      className="reader-prose w-full mx-auto min-h-[60vh] px-4 md:px-8 transition-all duration-300 ease-in-out"
      style={{ maxWidth: 'clamp(640px, 70vw, 1040px)' }}
    >
      {pageBlocks.map((block, blockIdx) => {
        if (block.type === 'image') {
          const srcMatch = block.content[0].match(/\[\[\[IMG_MARKER:(.*?)\]\]\]/)
          const src = srcMatch ? srcMatch[1] : ''
          return (
            <ImageBlock
              key={`image-${block.startIndex}-${blockIdx}`}
              src={src}
              isHighlight={globalSentenceIndex === block.startIndex}
              frameClass={imageFrameClass}
            />
          )
        }

        const blockText = block.content.join(' ').trim()
        const chapterPageIndex = tocLabelToPageIndex.get(normalizeTocLabel(blockText))

        if (typeof chapterPageIndex === 'number') {
          return (
            <button
              key={`chapter-${block.startIndex}-${blockIdx}`}
              onClick={() => onChapterClick(chapterPageIndex)}
              className="group mb-8 mt-6 w-full rounded-[28px] px-2 py-2 text-left transition hover:bg-white/[0.03]"
            >
              <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Section</div>
              <span
                className={`mt-2 block text-3xl font-bold tracking-tight transition-colors text-balance md:text-4xl ${
                  settings.theme === 'dark'
                    ? 'text-zinc-100 group-hover:text-white'
                    : 'text-zinc-900 group-hover:text-black'
                } ${fontFamilyClass}`}
              >
                {blockText}
              </span>
            </button>
          )
        }

        const activeSentenceLocalIndex =
          globalSentenceIndex >= block.startIndex &&
          globalSentenceIndex < block.startIndex + block.content.length
            ? globalSentenceIndex - block.startIndex
            : null

        return (
          <ParagraphBlock
            key={`paragraph-${block.startIndex}-${blockIdx}`}
            block={block}
            activeSentenceLocalIndex={activeSentenceLocalIndex}
            fontFamilyClass={fontFamilyClass}
            themeTextClass={themeTextClass}
            highlightClass={highlightClass}
            fontSize={settings.fontSize}
            lineHeight={settings.lineHeight}
          />
        )
      })}
    </div>
  )
}
