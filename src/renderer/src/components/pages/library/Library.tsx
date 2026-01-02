import React, { useState, useRef, useEffect, useMemo } from 'react'
import ePub from 'epubjs'

// --- DEFAULT STATE ---
const DEFAULT_PAGES = [
  `Welcome to Nur Reader. To begin, please click the "Import Book" button.`,
  `You can select any .epub file. The AI will extract text and images, reading it aloud continuously.`
]

export default function Library(): React.JSX.Element {
  const [bookPages, setBookPages] = useState<string[]>(DEFAULT_PAGES)
  const [bookTitle, setBookTitle] = useState('Nur Reader')

  const [isPlaying, setIsPlaying] = useState(false)
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')
  const [visualPageIndex, setVisualPageIndex] = useState(0)
  const [isLoadingBook, setIsLoadingBook] = useState(false)

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([])
  const playbackTimeoutsRef = useRef<NodeJS.Timeout[]>([])

  // --- 1. HYBRID IMPORTER (Robust Text + Images) ---
  const handleImportBook = async () => {
    try {
      // @ts-ignore
      const filePath = await window.api.openFileDialog()
      if (!filePath) return

      setStatus('Loading Book...')
      setIsLoadingBook(true)
      handleStop()

      // @ts-ignore
      const fileBuffer = await window.api.readFile(filePath)
      const rawData = new Uint8Array(fileBuffer)
      const cleanBuffer = rawData.buffer.slice(
        rawData.byteOffset,
        rawData.byteOffset + rawData.byteLength
      )

      const book = ePub(cleanBuffer)
      await book.ready
      const metadata = await book.loaded.metadata
      setBookTitle(metadata.title || 'Unknown Book')

      const newPages: string[] = []
      // @ts-ignore
      const spineItems = book.spine.spineItems

      console.log(`[Importer] Found ${spineItems.length} chapters.`)

      for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i]
        try {
          const target = item.href || item.canonical
          if (!target) continue

          const doc = await book.load(target)

          let dom: Document
          if (typeof doc === 'string') {
            const parser = new DOMParser()
            dom = parser.parseFromString(doc, 'application/xhtml+xml')
          } else {
            dom = doc as Document
          }

          // Remove Junk
          dom.querySelectorAll('style, script, link').forEach((el) => el.remove())

          // Extract Images
          const images = Array.from(dom.querySelectorAll('img, image'))
          for (const img of images) {
            const src = img.getAttribute('src') || img.getAttribute('href') || ''
            if (src) {
              try {
                // @ts-ignore
                const absolute = book.path.resolve(src, item.href)
                const url = await book.archive.createUrl(absolute)
                const marker = ` [[[IMG_MARKER:${url}]]] `
                const textNode = document.createTextNode(marker)
                img.parentNode?.replaceChild(textNode, img)
              } catch (err) {
                console.warn('Image error:', err)
              }
            }
          }

          const rawString = new XMLSerializer().serializeToString(dom)
          // Nuclear Regex: Kill tags, keep brackets
          let text = rawString.replace(/<[^>]+>/g, ' ')

          const txt = document.createElement('textarea')
          txt.innerHTML = text
          text = txt.value

          const cleanText = text.replace(/\s+/g, ' ').trim()

          if (cleanText.length > 20 || cleanText.includes('[[[IMG_MARKER')) {
            newPages.push(cleanText)
          }
        } catch (err) {
          console.warn(`[Importer] Failed chapter ${i}:`, err)
        }
      }

      if (newPages.length > 0) {
        setBookPages(newPages)
        setVisualPageIndex(0)
        setStatus('Book Loaded')
      } else {
        setStatus('Error: No content found')
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Import Error: ' + e.message)
    } finally {
      setIsLoadingBook(false)
    }
  }

  // --- 2. SENTENCE PARSING ---
  const bookStructure = useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []

    bookPages.forEach((pageText, pageIndex) => {
      // Split by markers FIRST to preserve image URLs
      // Then segment the text parts
      const parts = pageText.split(/(\[\[\[IMG_MARKER:.*?\]\]\])/g)

      parts.forEach((part) => {
        if (part.startsWith('[[[IMG_MARKER')) {
          // It's an image, treat as own sentence
          allSentences.push(part)
          sentenceToPageMap.push(pageIndex)
        } else {
          // It's text, segment it
          const rawSegments = [...segmenter.segment(part)].map((s) => s.segment)
          let buffer = ''
          for (const seg of rawSegments) {
            const trimmed = seg.trim()
            if (!trimmed) continue

            // Merge short junk lines
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

  const initAudioContext = () => {
    if (!audioCtxRef.current) {
      // @ts-ignore
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }

  const handleStop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')

    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close()
        audioCtxRef.current = null
      } catch (e) {}
    }
    scheduledNodesRef.current = []
    playbackTimeoutsRef.current.forEach((id) => clearTimeout(id))
    playbackTimeoutsRef.current = []

    // @ts-ignore
    await window.api.stop()
  }

  // --- 3. ROBUST READ LOGIC ---
  const handleReadBook = async () => {
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)
    initAudioContext()

    const ctx = audioCtxRef.current
    if (!ctx) return

    nextStartTimeRef.current = ctx.currentTime + 0.1

    const sentences = bookStructure.allSentences
    const startSentenceIndex = bookStructure.sentenceToPageMap.findIndex(
      (p) => p === visualPageIndex
    )
    const safeStartIndex = startSentenceIndex >= 0 ? startSentenceIndex : 0
    const activeSentences = sentences.slice(safeStartIndex)
    const getGlobalIndex = (localIndex: number) => safeStartIndex + localIndex

    const audioPromises = new Array(activeSentences.length).fill(null)
    const BUFFER_SIZE = 3
    const STARTUP_BUFFER = 2

    try {
      setStatus('Buffering...')

      // --- HELPER: GENERATOR ---
      const triggerGeneration = (index: number) => {
        if (index >= activeSentences.length) return
        const text = activeSentences[index]

        if (text.includes('[[[IMG_MARKER')) {
          audioPromises[index] = Promise.resolve({ status: 'skipped', audio_data: null })
        } else {
          // @ts-ignore
          audioPromises[index] = window.api.generate(text, 1.2)
        }
      }

      // 1. Kickstart
      const initialBatch = Math.min(activeSentences.length, BUFFER_SIZE)
      for (let i = 0; i < initialBatch; i++) triggerGeneration(i)

      // 2. Wait for startup
      const waitCount = Math.min(activeSentences.length, STARTUP_BUFFER)
      if (waitCount > 0) {
        setStatus(`Buffering ${waitCount} segments...`)
        try {
          await Promise.all(audioPromises.slice(0, waitCount))
        } catch (err) {
          console.error('Startup buffer failed, continuing anyway...', err)
        }
      }

      // 3. Playback Loop
      for (let i = 0; i < activeSentences.length; i++) {
        if (stopSignalRef.current) break

        const globalIndex = getGlobalIndex(i)

        // Update Status
        setStatus(`Reading chunk ${i + 1}...`)

        // A. Wait for Audio
        let result = null
        try {
          result = await audioPromises[i]
        } catch (err) {
          console.warn(`Request ${i} failed, skipping.`)
          continue // Skip this sentence if backend failed
        }

        if (stopSignalRef.current) break

        // B. Schedule Next
        triggerGeneration(i + BUFFER_SIZE)

        // C. Process Result
        if (result && result.status === 'skipped') {
          // IMAGE HANDLING
          setGlobalSentenceIndex(globalIndex)
          const pageOfThisSentence = bookStructure.sentenceToPageMap[globalIndex]
          setVisualPageIndex((c) => (c !== pageOfThisSentence ? pageOfThisSentence : c))

          // Pause 2 seconds for image
          const imagePause = 2.0
          nextStartTimeRef.current =
            Math.max(ctx.currentTime, nextStartTimeRef.current) + imagePause

          // Wait loop (don't block thread completely)
          await new Promise((r) => setTimeout(r, imagePause * 1000))
          continue
        }

        if (result && result.status === 'success') {
          try {
            // DECODE SAFELY
            const cleanBuffer = new Uint8Array(result.audio_data).buffer
            const audioBuffer = await ctx.decodeAudioData(cleanBuffer)

            const source = ctx.createBufferSource()
            source.buffer = audioBuffer
            source.connect(ctx.destination)

            const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
            source.start(start)
            scheduledNodesRef.current.push(source)

            // End of book check
            if (i === activeSentences.length - 1) {
              source.onended = () => {
                if (!stopSignalRef.current) {
                  setIsPlaying(false)
                  isPlayingRef.current = false
                  setStatus('Completed')
                  setGlobalSentenceIndex(-1)
                }
              }
            }

            // UI Sync Timer
            const delayMs = (start - ctx.currentTime) * 1000
            const timeoutId = setTimeout(() => {
              if (!stopSignalRef.current) {
                setGlobalSentenceIndex(globalIndex)
                const pageOfThisSentence = bookStructure.sentenceToPageMap[globalIndex]
                setVisualPageIndex((c) => (c !== pageOfThisSentence ? pageOfThisSentence : c))
              }
            }, delayMs)
            playbackTimeoutsRef.current.push(timeoutId)

            nextStartTimeRef.current = start + audioBuffer.duration

            // Throttle
            const timeUntilPlay = start - ctx.currentTime
            if (timeUntilPlay > 15) {
              await new Promise((r) => setTimeout(r, (timeUntilPlay - 5) * 1000))
            }
          } catch (decodeErr) {
            console.error('Audio Decode Failed for chunk ' + i, decodeErr)
            // Don't stop! Just continue to next sentence
          }
        }
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
      isPlayingRef.current = false
    } finally {
      if (stopSignalRef.current) {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
  }

  // --- 4. RENDERER ---
  const renderPageContent = () => {
    const pageSentences = bookStructure.allSentences
      .map((text, idx) => ({ text, idx }))
      .filter((item) => bookStructure.sentenceToPageMap[item.idx] === visualPageIndex)

    if (pageSentences.length === 0)
      return <div className="text-gray-500 italic p-4">Empty Page</div>

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

  useEffect(() => {
    return () => {
      handleStop()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white">My Library</h1>
          <p className="text-gray-400 text-sm mt-1">{status}</p>
        </div>
        <button
          onClick={handleImportBook}
          disabled={isLoadingBook || isPlaying}
          className={`px-4 py-2 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2 ${isLoadingBook ? 'bg-gray-700 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
        >
          {isLoadingBook ? 'Parsing...' : '📂 Import .epub'}
        </button>
      </div>
      <div className="max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setVisualPageIndex((p) => Math.max(0, p - 1))}
              disabled={visualPageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ←
            </button>
            <div className="text-center">
              <div className="font-semibold text-white italic truncate max-w-[200px]">
                {bookTitle}
              </div>
              <div className="text-xs font-mono text-gray-400">
                Chapter {visualPageIndex + 1} / {bookPages.length}
              </div>
            </div>
            <button
              onClick={() => setVisualPageIndex((p) => Math.min(bookPages.length - 1, p + 1))}
              disabled={visualPageIndex === bookPages.length - 1}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              →
            </button>
          </div>
          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={handleReadBook}
                disabled={bookPages.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>▶</span> Read
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>⏹</span> Stop
              </button>
            )}
          </div>
        </div>
        <div className="p-8 min-h-[500px] max-h-[70vh] overflow-y-auto">{renderPageContent()}</div>
      </div>
    </div>
  )
}
