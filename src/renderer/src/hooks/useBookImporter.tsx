import { useState, useMemo } from 'react'
import ePub from 'epubjs'

const DEFAULT_PAGES = [
  `Welcome to Nur Reader. To begin, please click the "Import Book" button.`,
  `You can select any .epub file. The AI will extract text and images, reading it aloud continuously.`
]

// Define the shape of our new visual structure
export interface VisualBlock {
  type: 'paragraph' | 'image'
  content: string[] // Array of sentences in this paragraph
  startIndex: number // Global index where this block starts
}

export function useBookImporter() {
  const [bookPages, setBookPages] = useState<string[]>(DEFAULT_PAGES)
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
      const title = metadata.title || 'Unknown Book'
      setBookTitle(title)

      const newPages: string[] = []
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

              // FIX: Removed the aggressive Drop Cap regex that was breaking "I heard" -> "Iheard"
              // Only normalize multiple spaces
              text = text.replace(/\s+/g, ' ')

              contentParts.push(text)
            })
          } else {
            contentParts.push(dom.body.textContent || '')
          }

          let fullText = contentParts.join('\n\n') // Preserve structure
          const cleanText = fullText.trim()

          if (cleanText.length > 20 || cleanText.includes('[[[IMG_MARKER')) {
            newPages.push(cleanText)
          }
        } catch (err) {
          console.warn(err)
        }
      }

      if (newPages.length > 0) {
        setBookPages(newPages)
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

  // --- 2. STRUCTURE PARSING ---
  const bookStructure = useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []

    // This holds the visual layout: Array of Pages -> Array of Blocks
    const pagesStructure: VisualBlock[][] = []

    bookPages.forEach((pageText, pageIndex) => {
      const pageBlocks: VisualBlock[] = []

      // 1. Split by "Blocks" (Paragraphs or Images)
      const rawBlocks = pageText.split(/(\[\[\[IMG_MARKER:.*?\]\]\]|\n\n)/g)

      rawBlocks.forEach((blockText) => {
        const trimmed = blockText.trim()
        if (!trimmed) return

        const currentStartIndex = allSentences.length

        if (trimmed.startsWith('[[[IMG_MARKER')) {
          // IMAGE BLOCK
          allSentences.push(trimmed)
          sentenceToPageMap.push(pageIndex)
          pageBlocks.push({
            type: 'image',
            content: [trimmed],
            startIndex: currentStartIndex
          })
        } else {
          // TEXT PARAGRAPH BLOCK
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

          // Add to global lists
          if (blockSentences.length > 0) {
            allSentences.push(...blockSentences)
            blockSentences.forEach(() => sentenceToPageMap.push(pageIndex))

            pageBlocks.push({
              type: 'paragraph',
              content: blockSentences,
              startIndex: currentStartIndex
            })
          }
        }
      })
      pagesStructure.push(pageBlocks)
    })

    return { allSentences, sentenceToPageMap, pagesStructure }
  }, [bookPages])

  return {
    bookPages,
    bookTitle,
    isLoading,
    error,
    importBook,
    bookStructure
  }
}
