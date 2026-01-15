import { useMemo } from 'react'
import { VisualBlock, TocItem } from '../types/book'

type EpubNavItem = {
  label: string
  href: string
  subitems?: EpubNavItem[]
}

const CHARS_PER_PAGE = 1500
const MAX_BLOCKS_PER_PAGE = 12

export function useBookPagination(
  rawChapters: string[],
  toc: EpubNavItem[],
  chapterHrefs: string[],
  charsPerPage: number = CHARS_PER_PAGE,
  maxBlocksPerPage: number = MAX_BLOCKS_PER_PAGE
) {
  return useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []
    const pagesStructure: VisualBlock[][] = []
    const chapterStartPages: number[] = []
    let globalSentenceIndex = 0

    rawChapters.forEach((chapterText, chapterIdx) => {
      chapterStartPages[chapterIdx] = pagesStructure.length
      const rawBlocks = chapterText.split(/(\[\[\[IMG_MARKER:.*?\]\]\]|\n\n)/g)
      const chapterBlocks: VisualBlock[] = []

      rawBlocks.forEach((blockText) => {
        const trimmed = blockText.trim()
        if (!trimmed) return

        if (trimmed.startsWith('[[[IMG_MARKER')) {
          chapterBlocks.push({
            type: 'image',
            content: [trimmed],
            startIndex: globalSentenceIndex
          })
          allSentences.push(trimmed)
          globalSentenceIndex++
        } else {
          const rawSegments = [...segmenter.segment(trimmed)].map((s) => s.segment)
          const blockSentences: string[] = []
          let buffer = ''
          for (const seg of rawSegments) {
            const t = seg.trim()
            if (!t) continue
            if ((buffer + ' ' + t).length < 40 || /^[")\]}]+$/.test(t)) {
              buffer += ' ' + t
            } else {
              if (buffer) blockSentences.push(buffer.trim())
              buffer = t
            }
          }
          if (buffer) blockSentences.push(buffer.trim())

          if (blockSentences.length > 0) {
            chapterBlocks.push({
              type: 'paragraph',
              content: blockSentences,
              startIndex: globalSentenceIndex
            })
            allSentences.push(...blockSentences)
            globalSentenceIndex += blockSentences.length
          }
        }
      })

      // Pagination Logic
      let currentPage: VisualBlock[] = []
      let currentLength = 0

      chapterBlocks.forEach((block) => {
        const blockLength = block.content.join(' ').length
        const isFullText = currentLength + blockLength > charsPerPage
        const isFullBlocks = currentPage.length >= maxBlocksPerPage

        if ((isFullText || isFullBlocks) && currentPage.length > 0) {
          pagesStructure.push(currentPage)
          const pageIndex = pagesStructure.length - 1
          currentPage.forEach((b) => {
            for (let i = 0; i < b.content.length; i++) sentenceToPageMap.push(pageIndex)
          })
          currentPage = []
          currentLength = 0
        }
        currentPage.push(block)
        currentLength += blockLength
      })
      if (currentPage.length > 0) {
        pagesStructure.push(currentPage)
        const pageIndex = pagesStructure.length - 1
        currentPage.forEach((b) => {
          for (let i = 0; i < b.content.length; i++) sentenceToPageMap.push(pageIndex)
        })
      }
    })

    // ToC Processing
    const processedToc: TocItem[] = []
    const processTocItems = (items: any[]) => {
      items.forEach((item) => {
        const cleanHref = item.href.split('#')[0]
        const chapterIdx = chapterHrefs.findIndex((h) => h.includes(cleanHref))
        if (chapterIdx !== -1) {
          processedToc.push({
            label: item.label.trim(),
            href: item.href,
            pageIndex: chapterStartPages[chapterIdx] || 0
          })
        }
        if (item.subitems?.length > 0) processTocItems(item.subitems)
      })
    }
    if (toc && Array.isArray(toc)) processTocItems(toc)

    return { allSentences, sentenceToPageMap, pagesStructure, processedToc }
  }, [rawChapters, toc, chapterHrefs, charsPerPage, maxBlocksPerPage])
}
