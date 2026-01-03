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

export interface TocItem {
  label: string
  href: string
  pageIndex: number
}

const CHARS_PER_PAGE = 1500
const MAX_BLOCKS_PER_PAGE = 12

// Helper to determine mime type based on file extension
const getMimeType = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg' // fallback
}

// Helper to reliably find a file in the zip, handling leading slashes, encoding, and nested folders
const getZipFile = (zip: any, path: string) => {
  if (!zip || !path) return null

  // 1. Try exact path
  let file = zip.file(path)
  if (file) return file

  // 2. Try removing leading slash
  const cleanPath = path.startsWith('/') ? path.substring(1) : path
  file = zip.file(cleanPath)
  if (file) return file

  // 3. Try decoding URI components
  const decoded = decodeURIComponent(cleanPath)
  file = zip.file(decoded)
  if (file) return file

  // 4. ROBUST FALLBACK: Search all files in zip for suffix match
  if (zip.files) {
    const allFiles = Object.keys(zip.files)
    for (const zipPath of allFiles) {
      if (zipPath.endsWith(cleanPath) || zipPath.endsWith(decoded)) {
        // Strict check: match filename exactly
        const parts = zipPath.split('/')
        const cleanParts = cleanPath.split('/')
        if (parts[parts.length - 1] === cleanParts[cleanParts.length - 1]) {
          return zip.file(zipPath)
        }
      }
    }
  }
  return null
}

export function useBookImporter() {
  const [rawChapters, setRawChapters] = useState<string[]>(DEFAULT_PAGES)
  const [chapterHrefs, setChapterHrefs] = useState<string[]>([])
  const [toc, setToc] = useState<TocItem[]>([])

  const [bookTitle, setBookTitle] = useState('Nur Reader')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- RECURSIVE TEXT EXTRACTOR ---
  const extractContentRecursively = (node: Node): string => {
    // 1. Text Nodes: Return content
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    // 2. Element Nodes: Process children
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      const tagName = el.tagName.toUpperCase()

      // Skip metadata/scripts
      if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'TITLE', 'LINK'].includes(tagName)) {
        return ''
      }

      // Process all children
      let childText = ''
      el.childNodes.forEach((child) => {
        childText += extractContentRecursively(child)
      })

      // Block-level elements: surround with newlines to preserve paragraphs
      const isBlock = [
        'P',
        'DIV',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'LI',
        'BLOCKQUOTE',
        'PRE',
        'FIGURE',
        'FIGCAPTION',
        'SECTION',
        'ARTICLE',
        'MAIN',
        'HEADER',
        'FOOTER'
      ].includes(tagName)

      if (isBlock) {
        return `\n\n${childText}\n\n`
      }

      return childText
    }
    return ''
  }

  // CORE LOGIC: Parses an ArrayBuffer into our book structure
  const parseEpubData = async (buffer: ArrayBuffer) => {
    const book = ePub(buffer)
    await book.ready

    const metadata = await book.loaded.metadata
    setBookTitle(metadata.title || 'Unknown Book')

    // --- 1. EXTRACT COVER ---
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

        // --- 2. PROCESS IMAGES ---
        const mediaElements = Array.from(dom.querySelectorAll('img, image, svg, object'))

        for (const el of mediaElements) {
          if (!el.isConnected) continue

          const tagName = el.tagName.toLowerCase()
          let dataUri: string | null = null

          try {
            // A. INLINE SVG
            if (tagName === 'svg') {
              // --- CRITICAL FIX START ---
              // If the SVG is just a wrapper for an image (common for covers),
              // SKIP processing the SVG. Let the loop find the inner <image> tag instead.
              if (el.querySelector('image, img')) {
                continue
              }
              // --- CRITICAL FIX END ---

              const serializer = new XMLSerializer()
              const svgString = serializer.serializeToString(el)
              const b64 = window.btoa(unescape(encodeURIComponent(svgString)))
              dataUri = `data:image/svg+xml;base64,${b64}`
            }
            // B. FILES (img, object)
            else {
              let src = ''
              if (tagName === 'object') {
                src = el.getAttribute('data') || ''
              } else {
                src =
                  el.getAttribute('src') ||
                  el.getAttribute('href') ||
                  el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
                  ''
              }

              if (src) {
                // @ts-expect-error
                const absolute = book.path.resolve(src, item.href)

                // Try standard lookup
                // @ts-expect-error
                let zipFile = getZipFile(book.archive.zip, absolute)

                if (zipFile) {
                  const b64 = await zipFile.async('base64')
                  const mime = getMimeType(absolute)
                  dataUri = `data:${mime};base64,${b64}`
                } else {
                  // --- AGGRESSIVE FALLBACK ---
                  // If lookup failed, and we have a cover, and we are in the first 2 chapters:
                  // Just use the cover. This fixes the "Shadow Outline" on title pages.
                  if (i < 2 && coverDataUri) {
                    console.log(`[Importer] Missing image at ${src}. Injecting Cover instead.`)
                    dataUri = coverDataUri
                  } else {
                    console.warn(`[Importer] Image not found: ${absolute}`)
                  }
                }
              }
            }

            // --- REPLACEMENT ---
            if (dataUri) {
              const marker = ` [[[IMG_MARKER:${dataUri}]]] `
              const textNode = document.createTextNode(marker)
              el.parentNode?.replaceChild(textNode, el)
            }
          } catch (err) {
            console.warn('Failed to process image/svg:', err)
          }
        }

        // --- 3. EXTRACT TEXT ---
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

    return {
      title: metadata.title || 'Unknown Book',
      cover: coverDataUri
    }
  }

  // IMPORT HANDLER
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

      // Get Title AND Cover
      const { title, cover } = await parseEpubData(cleanBuffer)

      if (returnDetails) {
        return { filePath, title, cover }
      }

      return null // <--- ADDED THIS to fix "Not all code paths return a value"
    } catch (e: any) {
      console.error(e)
      setError('Import Error: ' + e.message)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  // LOAD HANDLER
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

  const bookStructure = useMemo(() => {
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

      // Pagination
      let currentPage: VisualBlock[] = []
      let currentLength = 0

      chapterBlocks.forEach((block) => {
        const blockLength = block.content.join(' ').length
        const isFullText = currentLength + blockLength > CHARS_PER_PAGE
        const isFullBlocks = currentPage.length >= MAX_BLOCKS_PER_PAGE

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
  }, [rawChapters, toc, chapterHrefs])

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
