import { useState, useEffect } from 'react'

export default function Settings(): React.JSX.Element {
  const [engine, setEngine] = useState('xtts')

  const [piperStatus, setPiperStatus] = useState<'missing' | 'downloading' | 'ready'>('missing')
  const [piperPath, setPiperPath] = useState<string>('')
  const [progress, setProgress] = useState(0)

  const [customVoicePath, setCustomVoicePath] = useState<string>('')

  useEffect(() => {
    const savedEngine = localStorage.getItem('tts_engine') || 'xtts'
    const savedVoice = localStorage.getItem('custom_voice_path') || ''

    setEngine(savedEngine)
    setCustomVoicePath(savedVoice)

    checkPiperModel()

    const unsubscribe = window.api.onDownloadProgress((p) => {
      setProgress(p)
      if (p >= 100) {
        setPiperStatus('ready')
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
      if (localStorage.getItem('tts_engine') === 'piper') {
        handleEngineChange('xtts')
      }
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
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
    if (newEngine === 'piper' && piperStatus !== 'ready' && !force) {
      return
    }

    setEngine(newEngine)
    localStorage.setItem('tts_engine', newEngine)
  }

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-zinc-400 mt-1">Personalize your playback and voice settings.</p>
      </div>

      <div className="max-w-3xl space-y-8">
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)] space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Audio Engine</h2>
          </div>

          <div className="space-y-4">
            <div
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                engine === 'xtts'
                  ? 'bg-zinc-900/40 border-white/20 shadow-lg'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <button
                onClick={() => handleEngineChange('xtts')}
                className="w-full px-5 py-4 text-left flex justify-between items-center"
              >
                <div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    Coqui XTTS
                    <span className="text-xs bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded border border-white/10">
                      HQ
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    Realistic, emotive voices. Supports cloning.
                    <span className="ml-2 text-yellow-500 text-xs font-mono">Requires GPU</span>
                  </div>
                </div>
                {engine === 'xtts' ? (
                  <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold">
                    OK
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-white/20"></div>
                )}
              </button>

              {engine === 'xtts' && (
                <div className="px-5 pb-5 pt-2 border-t border-white/10 bg-black/20">
                  <div className="mt-3 text-sm font-semibold text-zinc-300 mb-2">
                    Voice Cloning (Reference Audio)
                  </div>

                  <div className="flex items-center gap-3">
                    {customVoicePath ? (
                      <div className="flex-1 bg-black/30 border border-white/10 rounded-lg p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-zinc-300">
                            WAV
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
                      <div className="flex-1 text-xs text-gray-400 italic bg-black/20 p-3 rounded-lg border border-dashed border-white/10">
                        Using Default Female Voice. Upload a short WAV file (6-10s) to clone a
                        voice.
                      </div>
                    )}

                    <button
                      onClick={handleVoiceSelect}
                      className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg text-sm font-bold shadow transition hover:-translate-y-0.5"
                    >
                      {customVoicePath ? 'Change Voice' : 'Select File'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden relative ${
                engine === 'piper'
                  ? 'bg-zinc-900/40 border-white/20 shadow-lg scale-[1.01]'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              {piperStatus === 'downloading' && (
                <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full">
                  <div
                    className="h-full bg-white/60 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="px-5 py-4 flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg flex items-center gap-2">
                    Piper TTS
                    <span className="text-xs bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded border border-white/10">
                      FAST
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">
                    Ultra-fast generation. Works on any CPU.
                  </div>
                </div>

                {piperStatus === 'ready' ? (
                  <button
                    onClick={() => handleEngineChange('piper')}
                    className="h-full absolute inset-0 w-full flex justify-end items-center px-5 focus:outline-none"
                  >
                    {engine === 'piper' ? (
                      <div className="h-6 w-6 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold shadow-lg">
                        OK
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full border-2 border-white/20 hover:border-white/50 transition-colors"></div>
                    )}
                  </button>
                ) : piperStatus === 'downloading' ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-200 font-mono">{Math.round(progress)}%</span>
                    <div className="animate-spin h-5 w-5 border-2 border-white/70 border-t-transparent rounded-full"></div>
                  </div>
                ) : (
                  <button
                    onClick={handleDownload}
                    className="z-10 px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-lg font-bold text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <span>Download Model</span>
                    <span className="bg-black/10 px-1.5 rounded text-xs">~60MB</span>
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
