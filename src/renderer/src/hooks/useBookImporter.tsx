import { useState, useMemo } from 'react'
import ePub from 'epubjs'

// 1. DEFINE DEFAULT PAGES
const DEFAULT_PAGES = [
  `Welcome to Nur Reader. To begin, please click the "Import Book" button.`,
  `You can select any .epub file. The AI will extract text and images, reading it aloud continuously.`
]

// Helper to escape regex characters for title filtering
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
      )

      const book = ePub(cleanBuffer)
      await book.ready

      const metadata = await book.loaded.metadata
      const title = metadata.title || 'Unknown Book'
      setBookTitle(title)

      const newPages: string[] = []

      // @ts-expect-error - epubjs types missing spineItems
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

          // 1. CLEANUP: Remove junk tags
          dom
            .querySelectorAll('style, script, link, meta, title, head')
            .forEach((el) => el.remove())

          // 2. IMAGE EXTRACTION
          const images = Array.from(dom.querySelectorAll('img, image'))
          for (const img of images) {
            const src = img.getAttribute('src') || img.getAttribute('href') || ''
            if (src) {
              try {
                // @ts-expect-error - internal API
                const absolute = book.path.resolve(src, item.href)
                // @ts-expect-error - internal API
                const url = await book.archive.createUrl(absolute)

                const marker = ` [[[IMG_MARKER:${url}]]] `
                const textNode = document.createTextNode(marker)
                img.parentNode?.replaceChild(textNode, img)
              } catch (err) {
                console.warn('Image error:', err)
              }
            }
          }

          // 3. SMART TEXT EXTRACTION (Target paragraphs/content instead of raw body)
          const contentParts: string[] = []

          // Select content elements. You can adjust this list if needed.
          const elements = dom.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote')

          if (elements.length > 0) {
            elements.forEach((el) => {
              let text = el.textContent || ''
              text = text.trim()

              // Filter Logic:
              if (!text) return
              // Skip simple page numbers
              if (/^\d+$/.test(text)) return
              // Skip common noise
              if (text.toLowerCase().includes('copyright')) return

              contentParts.push(text)
            })
          } else {
            // Fallback for weird EPUBs
            contentParts.push(dom.body.textContent || '')
          }

          let fullText = contentParts.join(' ')

          // 4. CLEAN DROP CAPS & SPACING
          // Fix "T he" -> "The"
          fullText = fullText.replace(/\b([A-Z])\s+([a-z])/g, '$1$2')

          const cleanText = fullText.replace(/\s+/g, ' ').trim()

          // 5. REMOVE REDUNDANT TITLE
          // If the chapter starts with the book title, remove it to avoid repetition
          if (cleanText.length > 20 || cleanText.includes('[[[IMG_MARKER')) {
            // We won't mutate cleanText directly, just push the check result
            // (Optional: You could implement regex title removal here if needed)
            newPages.push(cleanText)
          }
        } catch (err) {
          console.warn(`[Importer] Failed chapter ${i}:`, err)
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

  // 2. PARSE STRUCTURE
  const bookStructure = useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []

    bookPages.forEach((pageText, pageIndex) => {
      const parts = pageText.split(/(\[\[\[IMG_MARKER:.*?\]\]\])/g)

      parts.forEach((part) => {
        if (part.startsWith('[[[IMG_MARKER')) {
          allSentences.push(part)
          sentenceToPageMap.push(pageIndex)
        } else {
          const rawSegments = [...segmenter.segment(part)].map((s) => s.segment)
          let buffer = ''
          for (const seg of rawSegments) {
            const trimmed = seg.trim()
            if (!trimmed) continue

            if ((buffer + ' ' + trimmed).length < 40 || /^[")\]}]+$/.test(trimmed)) {
              buffer += ' ' + trimmed
            } else {
              if (buffer) {
                allSentences.push(buffer.trim())
                sentenceToPageMap.push(pageIndex)
              }
              buffer = trimmed
            }
          }
          if (buffer) {
            allSentences.push(buffer.trim())
            sentenceToPageMap.push(pageIndex)
          }
        }
      })
    })
    return { allSentences, sentenceToPageMap }
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
