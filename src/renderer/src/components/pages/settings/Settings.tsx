import { useState, useEffect } from 'react'

export default function Settings(): React.JSX.Element {
  const [engine, setEngine] = useState('xtts')

  // Piper State
  const [piperStatus, setPiperStatus] = useState<'missing' | 'downloading' | 'ready'>('missing')
  const [piperPath, setPiperPath] = useState<string>('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // 1. Load saved engine preference
    const saved = localStorage.getItem('tts_engine') || 'xtts'
    setEngine(saved)

    // 2. Check if Piper is installed
    checkPiperModel()

    // 3. Listen for download progress
    const unsubscribe = window.api.onDownloadProgress((p) => {
      setProgress(p)
      if (p >= 100) {
        setPiperStatus('ready')
        // Optional: Auto-select Piper when download completes
        handleEngineChange('piper', true)
      }
    })
    return () => unsubscribe()
  }, [])

  const checkPiperModel = async () => {
    // @ts-ignore
    const { exists, path } = await window.api.checkPiper()
    if (exists) {
      setPiperStatus('ready')
      setPiperPath(path)
      localStorage.setItem('piper_model_path', path)
    } else {
      setPiperStatus('missing')
      // If currently set to Piper but model is missing, revert to XTTS safely
      if (localStorage.getItem('tts_engine') === 'piper') {
        handleEngineChange('xtts')
      }
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering card click
    setPiperStatus('downloading')
    setProgress(0)

    // @ts-ignore
    const success = await window.api.downloadPiper()

    if (success) {
      await checkPiperModel()
    } else {
      setPiperStatus('missing')
      alert('Download failed. Please check your internet connection.')
    }
  }

  const handleEngineChange = (newEngine: string, force = false) => {
    // PREVENT selection if model is missing (unless forcing after download)
    if (newEngine === 'piper' && piperStatus !== 'ready' && !force) {
      return
    }

    setEngine(newEngine)
    localStorage.setItem('tts_engine', newEngine)
  }

  return (
    <div className="p-8 text-white h-full overflow-y-auto">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="max-w-3xl space-y-8">
        {/* AUDIO ENGINE SECTION */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Audio Engine</h2>
          </div>

          <div className="space-y-4">
            {/* OPTION A: XTTS (Always Available) */}
            <button
              onClick={() => handleEngineChange('xtts')}
              className={`w-full px-5 py-4 rounded-xl border text-left flex justify-between items-center transition-all duration-200 ${
                engine === 'xtts'
                  ? 'bg-indigo-600 border-indigo-500 shadow-lg scale-[1.01]'
                  : 'bg-gray-700/30 border-gray-600 hover:bg-gray-700/50'
              }`}
            >
              <div>
                <div className="font-bold text-lg flex items-center gap-2">
                  Coqui XTTS
                  <span className="text-xs bg-indigo-800 text-indigo-200 px-2 py-0.5 rounded border border-indigo-600">
                    HQ
                  </span>
                </div>
                <div className="text-sm text-gray-300 mt-1">
                  Realistic, emotive voices. Supports cloning.
                  <span className="ml-2 text-yellow-500 text-xs font-mono">Requires GPU</span>
                </div>
              </div>
              {engine === 'xtts' ? (
                <div className="h-6 w-6 rounded-full bg-white text-indigo-600 flex items-center justify-center font-bold">
                  ✓
                </div>
              ) : (
                <div className="h-6 w-6 rounded-full border-2 border-gray-500"></div>
              )}
            </button>

            {/* OPTION B: PIPER (Conditional State) */}
            <div
              className={`w-full rounded-xl border transition-all duration-200 overflow-hidden relative ${
                engine === 'piper'
                  ? 'bg-emerald-900/40 border-emerald-500 shadow-lg scale-[1.01]'
                  : 'bg-gray-700/30 border-gray-600'
              }`}
            >
              {/* Progress Bar Background (Only when downloading) */}
              {piperStatus === 'downloading' && (
                <div className="absolute bottom-0 left-0 h-1 bg-emerald-500/20 w-full">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="px-5 py-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    Piper TTS
                    <span className="text-xs bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700">
                      FAST
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    Ultra-fast generation. Works on any CPU.
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                {piperStatus === 'ready' ? (
                  // STATE: READY -> Selectable Radio Button
                  <button
                    onClick={() => handleEngineChange('piper')}
                    className="h-full absolute inset-0 w-full flex justify-end items-center px-5 focus:outline-none"
                  >
                    {engine === 'piper' ? (
                      <div className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow-lg">
                        ✓
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full border-2 border-gray-500 hover:border-emerald-400 transition-colors"></div>
                    )}
                  </button>
                ) : piperStatus === 'downloading' ? (
                  // STATE: DOWNLOADING -> Spinner / Text
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-emerald-400 font-mono">
                      {Math.round(progress)}%
                    </span>
                    <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                  </div>
                ) : (
                  // STATE: MISSING -> Download Button (Primary Action)
                  <button
                    onClick={handleDownload}
                    className="z-10 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <span>Download Model</span>
                    <span className="bg-black/20 px-1.5 rounded text-xs">~60MB</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
