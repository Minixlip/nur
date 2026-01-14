import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

type VoiceSample = {
  id: string
  name: string
  path: string
  createdAt: string
}

export default function Voice() {
  const [engine, setEngine] = useState('xtts')
  const [customVoicePath, setCustomVoicePath] = useState<string | null>(null)
  const [voiceLibrary, setVoiceLibrary] = useState<VoiceSample[]>([])
  const [pendingVoicePath, setPendingVoicePath] = useState<string | null>(null)
  const [pendingVoiceName, setPendingVoiceName] = useState('')

  useEffect(() => {
    setEngine(localStorage.getItem('tts_engine') || 'xtts')
    setCustomVoicePath(localStorage.getItem('custom_voice_path'))
    const loadLibrary = async () => {
      try {
        const voices = await window.api.listVoices()
        setVoiceLibrary(voices || [])
      } catch (err) {
        console.warn('Failed to load voice library', err)
      }
    }
    loadLibrary()
  }, [])

  const handleUpload = async () => {
    const filePath = await window.api.openAudioFileDialog()
    if (filePath) {
      const fileName = filePath.split(/[/\\]/).pop() || 'Voice Sample'
      const suggestedName = fileName.replace(/\.[^/.]+$/, '')
      setPendingVoicePath(filePath)
      setPendingVoiceName(suggestedName)
    }
  }

  const handleSaveVoice = async () => {
    if (!pendingVoicePath) return
    const trimmed = pendingVoiceName.trim()
    if (!trimmed) return
    const result = await window.api.addVoice(pendingVoicePath, trimmed)
    if (result?.success && result.voice) {
      setVoiceLibrary((prev) => [result.voice, ...prev])
      setCustomVoicePath(result.voice.path)
      localStorage.setItem('custom_voice_path', result.voice.path)
      localStorage.setItem('custom_voice_name', result.voice.name)
      setPendingVoicePath(null)
      setPendingVoiceName('')
    }
  }

  const handleCancelVoice = () => {
    setPendingVoicePath(null)
    setPendingVoiceName('')
  }

  const handleSelectVoice = (sample: VoiceSample) => {
    setCustomVoicePath(sample.path)
    localStorage.setItem('custom_voice_path', sample.path)
    localStorage.setItem('custom_voice_name', sample.name)
  }

  const handleRemoveVoice = (sample: VoiceSample) => {
    const remove = async () => {
      const ok = await window.api.removeVoice(sample.id)
      if (!ok) return
      setVoiceLibrary((prev) => prev.filter((item) => item.id !== sample.id))
      if (customVoicePath === sample.path) {
        setCustomVoicePath(null)
        localStorage.removeItem('custom_voice_path')
        localStorage.removeItem('custom_voice_name')
      }
    }
    remove()
  }

  return (
    <div className="p-8 text-white h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Voice Studio</h1>
        <p className="text-zinc-400 mt-1">Manage your cloning presets and voice profiles.</p>
      </div>

      {engine === 'piper' ? (
        <div className="p-5 bg-white/5 text-zinc-200 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
          You are currently using <strong>Piper TTS</strong>. Custom voice cloning is only
          available with <strong>Coqui XTTS</strong>.
          <div className="mt-3">
            <Link to="/settings" className="underline hover:text-white">
              Switch engine in Settings
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <h2 className="text-xl font-bold mb-2">Add Voice Sample</h2>
              <p className="text-zinc-400 text-sm mb-6">
                Upload a 6-10 second WAV file. Name it and reuse it anytime.
              </p>

              <div className="flex flex-col gap-4">
                <button
                  onClick={handleUpload}
                  className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <span className="text-2xl">+</span>
                  <span className="font-semibold">Upload Voice Sample</span>
                </button>

                {customVoicePath && (
                  <div className="bg-black/20 p-3 rounded-xl border border-white/10 flex items-center justify-between gap-3">
                    <div className="overflow-hidden">
                      <div className="text-xs text-zinc-400 uppercase font-bold">Active voice</div>
                      <div className="text-sm truncate text-zinc-200" title={customVoicePath}>
                        {customVoicePath.split(/[/\\]/).pop()}
                      </div>
                    </div>
                    <span className="text-[11px] text-emerald-300/80 uppercase tracking-wide">
                      In use
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Your Voice Library</h2>
                <span className="text-xs text-zinc-400">{voiceLibrary.length} samples</span>
              </div>

              {voiceLibrary.length === 0 ? (
                <div className="text-sm text-zinc-400 bg-black/20 border border-white/10 rounded-xl p-4">
                  No saved voices yet. Upload a voice sample to build your library.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {voiceLibrary.map((sample) => {
                    const isActive = customVoicePath === sample.path
                    return (
                      <div
                        key={sample.id}
                        className={`rounded-xl border p-4 bg-black/20 transition-all ${
                          isActive ? 'border-emerald-400/40 shadow-lg' : 'border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="overflow-hidden">
                            <div className="text-xs text-zinc-400 uppercase font-semibold">
                              Voice Sample
                            </div>
                            <div className="text-base text-zinc-200 font-semibold truncate">
                              {sample.name}
                            </div>
                            <div
                              className="text-xs text-zinc-500 mt-1 truncate"
                              title={sample.path}
                            >
                              {sample.path.split(/[/\\]/).pop()}
                            </div>
                          </div>
                          {isActive && (
                            <span className="text-[10px] text-emerald-300/80 uppercase tracking-wide">
                              Active
                            </span>
                          )}
                        </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleSelectVoice(sample)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              isActive
                                ? 'bg-emerald-400/10 text-emerald-200 border-emerald-300/30'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {isActive ? 'Selected' : 'Use Voice'}
                          </button>
                          <button
                            onClick={() => handleRemoveVoice(sample)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-zinc-300 hover:bg-red-500/20 hover:text-white transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {pendingVoicePath && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.5)]">
              <h3 className="text-lg font-semibold text-zinc-100">Name this voice</h3>
              <p className="text-sm text-zinc-400 mt-1">
                Give this sample a short, memorable name.
              </p>
              <div className="mt-4">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Voice name</label>
                <input
                  value={pendingVoiceName}
                  onChange={(event) => setPendingVoiceName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-white/30"
                  placeholder="Studio Voice"
                />
                <div className="text-xs text-zinc-500 mt-2 truncate">
                  {pendingVoicePath.split(/[/\\]/).pop()}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelVoice}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-white/10 text-zinc-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVoice}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition"
                >
                  Save Voice
                </button>
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  )
}
