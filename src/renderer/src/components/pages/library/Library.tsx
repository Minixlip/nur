import React, { useState, useRef, useEffect, useMemo } from 'react'

const BOOK_PAGES = [
  `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica.`,
  `"Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary."`,
  `Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it. Every time a book changes hands, every time someone runs his eyes down its pages, its spirit grows and strengthens.`
]

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [globalSentenceIndex, setGlobalSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')
  const [visualPageIndex, setVisualPageIndex] = useState(0)

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([])
  const playbackTimeoutsRef = useRef<NodeJS.Timeout[]>([])

  const bookStructure = useMemo(() => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
    const allSentences: string[] = []
    const sentenceToPageMap: number[] = []

    BOOK_PAGES.forEach((pageText, pageIndex) => {
      const rawSegments = [...segmenter.segment(pageText)].map((s) => s.segment)
      let buffer = ''
      for (const part of rawSegments) {
        const trimmed = part.trim()
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
    })
    return { allSentences, sentenceToPageMap }
  }, [])

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

      const initialBatch = Math.min(activeSentences.length, BUFFER_SIZE)
      for (let i = 0; i < initialBatch; i++) {
        // @ts-ignore
        audioPromises[i] = window.api.generate(activeSentences[i], 1.2)
      }

      const waitCount = Math.min(activeSentences.length, STARTUP_BUFFER)
      if (waitCount > 0) {
        setStatus(`Buffering ${waitCount} segments...`)
        await Promise.all(audioPromises.slice(0, waitCount))
      }

      for (let i = 0; i < activeSentences.length; i++) {
        if (stopSignalRef.current) break

        const globalIndex = getGlobalIndex(i)

        setStatus(`Buffering...`)

        const result = await audioPromises[i]
        if (stopSignalRef.current) break

        const nextToSchedule = i + BUFFER_SIZE
        if (nextToSchedule < activeSentences.length && !audioPromises[nextToSchedule]) {
          // @ts-ignore
          audioPromises[nextToSchedule] = window.api.generate(activeSentences[nextToSchedule], 1.2)
        }

        if (result && result.status === 'success') {
          const cleanBuffer = new Uint8Array(result.audio_data).buffer
          const audioBuffer = await ctx.decodeAudioData(cleanBuffer)
          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)

          const start = Math.max(ctx.currentTime, nextStartTimeRef.current)
          source.start(start)
          scheduledNodesRef.current.push(source)

          // --- FIX: DETECT END OF BOOK ---
          // If this is the LAST sentence in the list, attach an 'onended' listener
          if (i === activeSentences.length - 1) {
            source.onended = () => {
              if (!stopSignalRef.current) {
                console.log('Book finished naturally.')
                setIsPlaying(false)
                isPlayingRef.current = false
                setStatus('Completed')
                setGlobalSentenceIndex(-1)
              }
            }
          }
          // -------------------------------

          const delayMs = (start - ctx.currentTime) * 1000

          const timeoutId = setTimeout(() => {
            if (!stopSignalRef.current) {
              setGlobalSentenceIndex(globalIndex)
              const pageOfThisSentence = bookStructure.sentenceToPageMap[globalIndex]
              setVisualPageIndex((current) => {
                if (current !== pageOfThisSentence) return pageOfThisSentence
                return current
              })
            }
          }, delayMs)

          playbackTimeoutsRef.current.push(timeoutId)

          nextStartTimeRef.current = start + audioBuffer.duration

          const timeUntilPlay = start - ctx.currentTime
          if (timeUntilPlay > 15) {
            await new Promise((r) => setTimeout(r, (timeUntilPlay - 5) * 1000))
          }
        }
      }

      // We removed setStatus('Finished') from here because the loop finishes BEFORE audio finishes.
      // The status update now happens in the source.onended callback above.
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
      setIsPlaying(false)
      isPlayingRef.current = false
    } finally {
      // Only force stop if the user clicked Stop.
      // Otherwise let the 'onended' event handle the cleanup.
      if (stopSignalRef.current) {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
  }

  const renderPageContent = () => {
    const pageSentences = bookStructure.allSentences
      .map((text, idx) => ({ text, idx }))
      .filter((item) => bookStructure.sentenceToPageMap[item.idx] === visualPageIndex)

    return (
      <div className="leading-relaxed text-lg text-gray-300 font-serif">
        {pageSentences.map((item, localIdx) => (
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
        ))}
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
        <h1 className="text-3xl font-bold text-white">My Library</h1>
        <div className="text-sm font-mono text-gray-400">
          Status: <span className="text-indigo-400">{status}</span>
        </div>
      </div>
      <div className="max-w-3xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
        <div className="bg-gray-750 p-4 border-b border-gray-700 flex justify-between items-center backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setVisualPageIndex((p) => Math.max(0, p - 1))}
              disabled={visualPageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="font-mono text-gray-400">
              Page {visualPageIndex + 1} / {BOOK_PAGES.length}
            </span>
            <button
              onClick={() => setVisualPageIndex((p) => Math.min(BOOK_PAGES.length - 1, p + 1))}
              disabled={visualPageIndex === BOOK_PAGES.length - 1}
              className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={handleReadBook}
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
        <div className="p-8 min-h-[400px]">{renderPageContent()}</div>
      </div>
    </div>
  )
}
