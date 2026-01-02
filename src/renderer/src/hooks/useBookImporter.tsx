import { useState, useMemo } from 'react'
import ePub from 'epubjs'

const DEFAULT_PAGES = [
  `Welcome to Nur Reader. To begin, please click the "Import Book" button.`,
  `You can select any .epub file. The AI will extract text and images, reading it aloud continuously.`
]

export interface VisualBlock {
  type: 'paragraph' | 'image'
  content: string[]
  startIndex: number
}

// Data structure for Table of Contents
export interface TocItem {
  label: string
  href: string
  pageIndex: number // The Virtual Page index where this chapter starts
}

const CHARS_PER_PAGE = 1500

export function useBookImporter() {
  const [rawChapters, setRawChapters] = useState<string[]>(DEFAULT_PAGES)
  // Store the raw hrefs to map them to pages later
  const [chapterHrefs, setChapterHrefs] = useState<string[]>([])
  const [toc, setToc] = useState<TocItem[]>([])

  const [bookTitle, setBookTitle] = useState('Nur Reader')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importBook = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const filePath = await window.api.openFileDialog()
      if (!filePath) return

      const fileBuffer = await window.api.readFile(filePath)
      const rawData = new Uint8Array(fileBuffer)
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer

      const book = ePub(cleanBuffer)
      await book.ready

      const metadata = await book.loaded.metadata
      setBookTitle(metadata.title || 'Unknown Book')

      // 1. EXTRACT RAW NAVIGATION (ToC)
      const navigation = await book.loaded.navigation
      const rawToc = navigation.toc

      const newChapters: string[] = []
      const newHrefs: string[] = []

      // @ts-expect-error
      const spineItems = book.spine.spineItems as any[]

      console.log(`[Importer] Found ${spineItems.length} chapters.`)

      for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i]
        try {
          // Store the HREF for linking later
          const target = item.href
          if (!target) continue

          const doc = (await book.load(target)) as Document | string
          let dom: Document
          if (typeof doc === 'string') {
            const parser = new DOMParser()
            dom = parser.parseFromString(doc, 'application/xhtml+xml')
          } else {
            dom = doc
          }

          // Cleanup
          dom
            .querySelectorAll('style, script, link, meta, title, head')
            .forEach((el) => el.remove())

          // Images
          const images = Array.from(dom.querySelectorAll('img, image'))
          for (const img of images) {
            const src = img.getAttribute('src') || img.getAttribute('href') || ''
            if (src) {
              try {
                // @ts-expect-error
                const absolute = book.path.resolve(src, item.href)
                // @ts-expect-error
                const url = await book.archive.createUrl(absolute)
                const marker = ` [[[IMG_MARKER:${url}]]] `
                const textNode = document.createTextNode(marker)
                img.parentNode?.replaceChild(textNode, img)
              } catch (err) {
                console.warn(err)
              }
            }
          }

          // Extraction
          const contentParts: string[] = []
          const elements = dom.querySelectorAll(
            'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre'
          )

          if (elements.length > 0) {
            elements.forEach((el) => {
              let text = el.textContent || ''
              text = text.trim()
              if (!text) return
              if (/^\d+$/.test(text)) return
              if (text.toLowerCase().includes('copyright')) return

              if (text.includes('[[[IMG_MARKER')) {
                contentParts.push(text)
                return
              }
              text = text.replace(/\s+/g, ' ')
              contentParts.push(text)
            })
          } else {
            contentParts.push(dom.body.textContent || '')
          }

          const fullText = contentParts.join('\n\n')
          const cleanText = fullText.trim()

          // Push even empty chapters so indexes align with hrefs
          newChapters.push(cleanText)
          newHrefs.push(target)
        } catch (err) {
          console.warn(err)
        }
      }

      setRawChapters(newChapters)
      setChapterHrefs(newHrefs)

      // Pass rawToc to state temporarily, we will process it in useMemo
      // We can't process it here because we don't know the page breaks yet
      // So we store the raw object structure for now
      // @ts-expect-error
      setToc(rawToc)
    } catch (e: any) {
      console.error(e)
      setError('Import Error: ' + e.message)
    } finally {
      setIsLoading(false)
    }
  }

  // --- 2. STRUCTURE & PAGINATION ENGINE ---
  const bookStructure = useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []
    const pagesStructure: VisualBlock[][] = []

    // MAP: Chapter Index -> Page Index (Where does Chapter X start?)
    const chapterStartPages: number[] = []

    let globalSentenceIndex = 0

    rawChapters.forEach((chapterText, chapterIdx) => {
      // RECORD START PAGE OF THIS CHAPTER
      // The current length of pagesStructure is the start page for this new chapter
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

      // PAGINATE
      let currentPage: VisualBlock[] = []
      let currentLength = 0

      chapterBlocks.forEach((block) => {
        const blockLength = block.content.join(' ').length
        if (currentLength + blockLength > CHARS_PER_PAGE && currentPage.length > 0) {
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
      // Ensure empty chapters don't break logic (they start on the next available page)
      if (chapterBlocks.length === 0 && pagesStructure.length > 0) {
        // Point to the last page or next page?
        // Keep it simple: point to current end
      }
    })

    // 3. PROCESS TABLE OF CONTENTS
    // We map the raw EPUB ToC (hrefs) to our Virtual Page Indexes
    const processedToc: TocItem[] = []

    // Recursive function to flatten ToC if needed, or just iterate top level
    const processTocItems = (items: any[]) => {
      items.forEach((item) => {
        // Find which chapter index matches this href
        // item.href might be "chapter1.xhtml#subid" or just "chapter1.xhtml"
        const cleanHref = item.href.split('#')[0]

        // Find index in our hrefs list
        const chapterIdx = chapterHrefs.findIndex((h) => h.includes(cleanHref))

        if (chapterIdx !== -1) {
          processedToc.push({
            label: item.label.trim(),
            href: item.href,
            pageIndex: chapterStartPages[chapterIdx] || 0
          })
        }
        if (item.subitems && item.subitems.length > 0) {
          processTocItems(item.subitems)
        }
      })
    }

    // @ts-expect-error
    if (toc && Array.isArray(toc)) {
      // @ts-expect-error
      processTocItems(toc)
    }

    return { allSentences, sentenceToPageMap, pagesStructure, processedToc }
  }, [rawChapters, toc, chapterHrefs])

  return {
    totalPages: bookStructure.pagesStructure.length,
    bookTitle,
    isLoading,
    error,
    importBook,
    bookStructure
  }
}
