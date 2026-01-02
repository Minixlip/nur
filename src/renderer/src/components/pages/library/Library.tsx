import React, { useState, useRef, useEffect } from 'react'

export default function Library(): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [status, setStatus] = useState('Idle')

  const isPlayingRef = useRef(false)
  const stopSignalRef = useRef(false)

  const bookTitle = 'The Shadow of the Wind'
  const bookContent = `I still remember the day my father took me to the Cemetery of Forgotten Books for the first time. It was the early summer of 1945, and we walked through the streets of a Barcelona trapped beneath ashen skies as a dawn of mist poured over the Rambla de Santa Mónica. "Daniel, you mustn't tell anyone what you're about to see today," my father warned. "No one." "Not even my friend Bernat?" "No one," he said, smoothing his hat. "This is a place of mystery, Daniel, a sanctuary. Every book, every volume you see here, has a soul. The soul of the person who wrote it and of those who read it and lived and dreamed with it."`

  // FIX 1: Split by commas too!
  // This creates smaller audio chunks (3s instead of 10s), reducing initial wait time massively.
  const splitSentences = (text: string) => {
    return text.match(/[^.!?,\n]+[.!?,\n]+["']?|[^.!?,\n]+$/g) || [text]
  }

  const handleStop = async () => {
    console.log('Stopping...')
    stopSignalRef.current = true
    isPlayingRef.current = false
    setIsPlaying(false)
    setStatus('Stopped')
    setCurrentSentenceIndex(-1)
    // @ts-ignore
    await window.api.stop()
  }

  const handleReadAloud = async () => {
    if (isPlayingRef.current) return

    stopSignalRef.current = false
    isPlayingRef.current = true
    setIsPlaying(true)

    // 1. Get smaller chunks
    const sentences = splitSentences(bookContent)

    // 2. Initialize the "Promise Buffer"
    // We store the *Promises* of the audio, not the audio itself.
    const audioPromises = new Array(sentences.length).fill(null)

    // Configuration: How many sentences to generate ahead?
    // 3 is a sweet spot. While you listen to S1, we generate S2, S3, S4.
    const BUFFER_SIZE = 3

    try {
      setStatus('Buffering...')

      // 3. Prime the Pump: Start generating the first batch immediately
      for (let i = 0; i < Math.min(sentences.length, BUFFER_SIZE); i++) {
        // @ts-ignore
        audioPromises[i] = window.api.generate(sentences[i])
      }

      // 4. The Consumer Loop
      for (let i = 0; i < sentences.length; i++) {
        if (stopSignalRef.current) break

        setCurrentSentenceIndex(i)
        setStatus(`Reading segment ${i + 1}/${sentences.length}...`)

        // A. Wait for the current chunk to be ready
        // Since we started it 3 loops ago, it's likely already done!
        const currentAudioResult = await audioPromises[i]

        if (stopSignalRef.current) break

        // B. Keep the Buffer Full
        // As soon as we consume S1, we start generating S4.
        // This ensures the CPU is NEVER idle.
        const nextToSchedule = i + BUFFER_SIZE
        if (nextToSchedule < sentences.length && !audioPromises[nextToSchedule]) {
          // @ts-ignore
          audioPromises[nextToSchedule] = window.api.generate(sentences[nextToSchedule])
        }

        // C. Play
        if (currentAudioResult && currentAudioResult.status === 'success') {
          // @ts-ignore
          await window.api.play(currentAudioResult.audio_filepath)
        }
      }
    } catch (e: any) {
      console.error(e)
      setStatus('Error: ' + e.message)
    } finally {
      if (!stopSignalRef.current) {
        setStatus('Finished')
        setCurrentSentenceIndex(-1)
      }
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }

  // ... (Rest of UI code is same as before) ...
  // (Paste the return (...) block from the previous step here, or keep your existing UI)
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
          <h2 className="text-xl font-semibold text-white italic">{bookTitle}</h2>
          <div className="flex gap-2">
            {!isPlaying ? (
              <button
                onClick={handleReadAloud}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold shadow-lg transition-all"
              >
                <span>▶</span> Read Book
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
        <div className="p-8 leading-relaxed text-lg text-gray-300 font-serif">
          {splitSentences(bookContent).map((sentence, index) => (
            <span
              key={index}
              className={`transition-all duration-300 px-1 rounded ${index === currentSentenceIndex && isPlaying ? 'bg-indigo-600/40 text-white shadow-sm box-decoration-clone' : ''}`}
            >
              {sentence}{' '}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
