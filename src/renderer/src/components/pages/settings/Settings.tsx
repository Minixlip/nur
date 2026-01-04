import { useState, useEffect } from 'react'

export default function Settings(): React.JSX.Element {
  const [engine, setEngine] = useState('xtts')

  // Piper State
  const [piperStatus, setPiperStatus] = useState<'missing' | 'downloading' | 'ready'>('missing')
  const [piperPath, setPiperPath] = useState<string>('')
  const [progress, setProgress] = useState(0)

  // NEW: Custom Voice State
  const [customVoicePath, setCustomVoicePath] = useState<string>('')

  useEffect(() => {
    // 1. Load saved preferences
    const savedEngine = localStorage.getItem('tts_engine') || 'xtts'
    const savedVoice = localStorage.getItem('custom_voice_path') || ''

    setEngine(savedEngine)
    setCustomVoicePath(savedVoice)

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

  // --- NEW: Voice Cloning Handlers ---

  const handleVoiceSelect = async () => {
    // @ts-ignore
    const path = await window.api.openAudioFileDialog()
    if (path) {
      setCustomVoicePath(path)
      localStorage.setItem('custom_voice_path', path)
    }
  }

  const handleResetVoice = () => {
    setCustomVoicePath('')
    localStorage.removeItem('custom_voice_path')
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
            <div
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                engine === 'xtts'
                  ? 'bg-indigo-900/40 border-indigo-500 shadow-lg'
                  : 'bg-gray-700/30 border-gray-600'
              }`}
            >
              <button
                onClick={() => handleEngineChange('xtts')}
                className="w-full px-5 py-4 text-left flex justify-between items-center"
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
                  <div className="h-6 w-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold">
                    ✓
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-gray-500"></div>
                )}
              </button>

              {/* VOICE CLONING SUB-SECTION (Only visible when XTTS is active) */}
              {engine === 'xtts' && (
                <div className="px-5 pb-5 pt-2 border-t border-indigo-500/30 bg-black/20">
                  <div className="mt-3 text-sm font-semibold text-indigo-300 mb-2">
                    Voice Cloning (Reference Audio)
                  </div>

                  <div className="flex items-center gap-3">
                    {customVoicePath ? (
                      <div className="flex-1 bg-gray-900/50 border border-indigo-500/50 rounded-lg p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs">
                            🎤
                          </div>
                          <div className="truncate text-sm text-gray-200" title={customVoicePath}>
                            ...{customVoicePath.slice(-40)}
                          </div>
                        </div>
                        <button
                          onClick={handleResetVoice}
                          className="text-xs text-red-400 hover:text-red-300 px-2 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 text-xs text-gray-400 italic bg-gray-900/30 p-3 rounded-lg border border-dashed border-gray-600">
                        Using Default Female Voice. Upload a short WAV file (6-10s) to clone a
                        voice.
                      </div>
                    )}

                    <button
                      onClick={handleVoiceSelect}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold shadow transition hover:-translate-y-0.5"
                    >
                      {customVoicePath ? 'Change Voice' : 'Select File'}
                    </button>
                  </div>
                </div>
              )}
            </div>

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
