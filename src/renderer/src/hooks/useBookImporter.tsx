import { useEffect, useState } from 'react'
import ePub from 'epubjs'
import { TocItem } from '../types/book'
import { getMimeType, getZipFile, extractContentRecursively } from '../utils/epubUtils'
import { useBookPagination } from './useBookPagination'

const DEFAULT_PAGES = [
  `Welcome to Nur Reader. To begin, please click the "Import Book" button.`,
  `You can select any .epub file. The AI will extract text and images, reading it aloud continuously.`
]

export function useBookImporter() {
  const [rawChapters, setRawChapters] = useState<string[]>(DEFAULT_PAGES)
  const [chapterHrefs, setChapterHrefs] = useState<string[]>([])
  const [toc, setToc] = useState<TocItem[]>([])

  const [bookTitle, setBookTitle] = useState('Nur Reader')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [charsPerPage, setCharsPerPage] = useState(1500)
  const [maxBlocksPerPage, setMaxBlocksPerPage] = useState(12)

  useEffect(() => {
    const baseArea = 900 * 670
    const baseChars = 1500
    const baseBlocks = 12

    const updateLayout = () => {
      const width = window.innerWidth || 900
      const height = window.innerHeight || 670
      const areaScale = (width * height) / baseArea
      const nextChars = Math.round(baseChars * areaScale)
      const nextBlocks = Math.round(baseBlocks * (height / 670))

      setCharsPerPage(Math.min(3600, Math.max(1200, nextChars)))
      setMaxBlocksPerPage(Math.min(20, Math.max(8, nextBlocks)))
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  // 1. Separate Pagination Logic
  const bookStructure = useBookPagination(
    rawChapters,
    toc,
    chapterHrefs,
    charsPerPage,
    maxBlocksPerPage
  )

  // 2. Core Parse Logic
  const parseEpubData = async (buffer: ArrayBuffer) => {
    const book = ePub(buffer)
    await book.ready

    const metadata = await book.loaded.metadata
    setBookTitle(metadata.title || 'Unknown Book')

    // --- EXTRACT COVER ---
    let coverDataUri: string | null = null
    try {
      const coverPath = await book.loaded.cover
      if (coverPath) {
        // @ts-expect-error
        const zipFile = getZipFile(book.archive.zip, coverPath)
        if (zipFile) {
          const b64 = await zipFile.async('base64')
          const mime = getMimeType(coverPath)
          coverDataUri = `data:${mime};base64,${b64}`
          console.log('[Importer] Cover extracted successfully.')
        }
      }
    } catch (err) {
      console.warn('[Importer] Failed to extract cover:', err)
    }

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

        // Process Images
        const mediaElements = Array.from(dom.querySelectorAll('img, image, svg, object'))
        for (const el of mediaElements) {
          if (!el.isConnected) continue
          const tagName = el.tagName.toLowerCase()
          let dataUri: string | null = null

          try {
            if (tagName === 'svg') {
              if (el.querySelector('image, img')) continue
              const serializer = new XMLSerializer()
              const svgString = serializer.serializeToString(el)
              const b64 = window.btoa(unescape(encodeURIComponent(svgString)))
              dataUri = `data:image/svg+xml;base64,${b64}`
            } else {
              let src = ''
              if (tagName === 'object') src = el.getAttribute('data') || ''
              else
                src =
                  el.getAttribute('src') ||
                  el.getAttribute('href') ||
                  el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                  ''

              if (src) {
                // @ts-expect-error
                const absolute = book.path.resolve(src, item.href)
                // @ts-expect-error
                let zipFile = getZipFile(book.archive.zip, absolute)

                if (zipFile) {
                  const b64 = await zipFile.async('base64')
                  const mime = getMimeType(absolute)
                  dataUri = `data:${mime};base64,${b64}`
                } else {
                  if (i < 2 && coverDataUri) {
                    dataUri = coverDataUri
                  }
                }
              }
            }

            if (dataUri) {
              const marker = ` [[[IMG_MARKER:${dataUri}]]] `
              const textNode = document.createTextNode(marker)
              el.parentNode?.replaceChild(textNode, el)
            }
          } catch (err) {
            console.warn('Failed to process image:', err)
          }
        }

        // Extract Text
        let fullText = extractContentRecursively(dom.body)
        fullText = fullText.replace(/\n\s+\n/g, '\n\n').trim()

        newChapters.push(fullText)
        newHrefs.push(target)
      } catch (err) {
        console.warn('Chapter parse warning:', err)
      }
    }

    setRawChapters(newChapters)
    setChapterHrefs(newHrefs)
    // @ts-expect-error
    setToc(rawToc)

    return { title: metadata.title || 'Unknown Book', cover: coverDataUri }
  }

  // --- HANDLERS ---
  const importBook = async (returnDetails = false) => {
    try {
      setIsLoading(true)
      setError(null)
      const filePath = await window.api.openFileDialog()
      if (!filePath) return null

      const fileBuffer = await window.api.readFile(filePath)
      const rawData = new Uint8Array(fileBuffer)
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer

      const { title, cover } = await parseEpubData(cleanBuffer)

      if (returnDetails) return { filePath, title, cover }
      return null
    } catch (e: any) {
      console.error(e)
      setError('Import Error: ' + e.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const loadBookByPath = async (filePath: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const fileBuffer = await window.api.readFile(filePath)
      const rawData = new Uint8Array(fileBuffer)
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      ) as ArrayBuffer
      await parseEpubData(cleanBuffer)
    } catch (e: any) {
      console.error(e)
      setError('Could not load book: ' + e.message)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    totalPages: bookStructure.pagesStructure.length,
    bookTitle,
    isLoading,
    error,
    importBook,
    loadBookByPath,
    bookStructure
  }
}
