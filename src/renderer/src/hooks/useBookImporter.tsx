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

// CONFIG: How much text fits on one screen?
const CHARS_PER_PAGE = 1500

export function useBookImporter() {
  const [rawChapters, setRawChapters] = useState<string[]>(DEFAULT_PAGES)
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

      const newChapters: string[] = []
      // @ts-expect-error
      const spineItems = book.spine.spineItems as any[]

      console.log(`[Importer] Found ${spineItems.length} chapters.`)

      for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i]
        try {
          const target = item.href || item.canonical
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

          // Content Extraction
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

          let fullText = contentParts.join('\n\n')
          const cleanText = fullText.trim()

          if (cleanText.length > 20 || cleanText.includes('[[[IMG_MARKER')) {
            newChapters.push(cleanText)
          }
        } catch (err) {
          console.warn(err)
        }
      }

      if (newChapters.length > 0) {
        setRawChapters(newChapters)
      } else {
        setError('Error: No content found')
      }
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

    // Instead of Chapters, we now have "Virtual Pages"
    const pagesStructure: VisualBlock[][] = []

    let globalSentenceIndex = 0

    // Iterate through real Chapters
    rawChapters.forEach((chapterText) => {
      // 1. Break Chapter into Blocks
      const rawBlocks = chapterText.split(/(\[\[\[IMG_MARKER:.*?\]\]\]|\n\n)/g)
      const chapterBlocks: VisualBlock[] = []

      rawBlocks.forEach((blockText) => {
        const trimmed = blockText.trim()
        if (!trimmed) return

        if (trimmed.startsWith('[[[IMG_MARKER')) {
          // IMAGE BLOCK
          chapterBlocks.push({
            type: 'image',
            content: [trimmed],
            startIndex: globalSentenceIndex
          })
          allSentences.push(trimmed)
          globalSentenceIndex++
        } else {
          // TEXT BLOCK
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

      // 2. PAGINATE THE BLOCKS
      // We accumulate blocks until we hit CHARS_PER_PAGE, then start a new page
      let currentPage: VisualBlock[] = []
      let currentLength = 0

      chapterBlocks.forEach((block) => {
        const blockLength = block.content.join(' ').length

        // If adding this block exceeds limit (and page isn't empty), push page
        if (currentLength + blockLength > CHARS_PER_PAGE && currentPage.length > 0) {
          pagesStructure.push(currentPage)

          // Map sentences to this new page index
          const pageIndex = pagesStructure.length - 1
          currentPage.forEach((b) => {
            // Each sentence in this block belongs to 'pageIndex'
            for (let i = 0; i < b.content.length; i++) sentenceToPageMap.push(pageIndex)
          })

          // Reset
          currentPage = []
          currentLength = 0
        }

        currentPage.push(block)
        currentLength += blockLength
      })

      // Push remaining blocks
      if (currentPage.length > 0) {
        pagesStructure.push(currentPage)
        const pageIndex = pagesStructure.length - 1
        currentPage.forEach((b) => {
          for (let i = 0; i < b.content.length; i++) sentenceToPageMap.push(pageIndex)
        })
      }
    })

    return { allSentences, sentenceToPageMap, pagesStructure }
  }, [rawChapters])

  return {
    bookPages: rawChapters, // Kept for reference if needed
    totalPages: bookStructure.pagesStructure.length, // EXPOSE TOTAL PAGES
    bookTitle,
    isLoading,
    error,
    importBook,
    bookStructure
  }
}
