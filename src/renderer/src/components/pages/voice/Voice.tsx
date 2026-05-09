import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import { getAppTheme } from '../../../theme/appTheme'
import { getStoredTtsEngine, TTS_ENGINE_CHANGED_EVENT, type TtsEngine } from '../../../utils/tts'

type VoiceSample = {
  id: string
  name: string
  path: string
  createdAt: string
}

export default function Voice() {
  const [engine, setEngine] = useState<TtsEngine>(getStoredTtsEngine())
  const { settings } = useReaderSettings()
  const theme = getAppTheme(settings.theme)
  const [customVoicePath, setCustomVoicePath] = useState<string | null>(() =>
    localStorage.getItem('custom_voice_path')
  )
  const [voiceLibrary, setVoiceLibrary] = useState<VoiceSample[]>([])
  const [pendingVoicePath, setPendingVoicePath] = useState<string | null>(null)
  const [pendingVoiceName, setPendingVoiceName] = useState('')

  useEffect(() => {
    const syncEngine = () => setEngine(getStoredTtsEngine())
    syncEngine()
    const loadLibrary = async () => {
      try {
        const voices = await window.api.listVoices()
        setVoiceLibrary(voices || [])
      } catch (err) {
        console.warn('Failed to load voice library', err)
      }
    }
    loadLibrary()
    window.addEventListener(TTS_ENGINE_CHANGED_EVENT, syncEngine)
    return () => window.removeEventListener(TTS_ENGINE_CHANGED_EVENT, syncEngine)
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
    <div className={`p-8 h-full overflow-y-auto ${theme.body}`}>
      <div className="mb-8">
        <h1 className={`text-3xl font-bold ${theme.title}`}>Voice Studio</h1>
        <p className={`mt-1 ${theme.muted}`}>Manage your cloning presets and voice profiles.</p>
      </div>

      {engine === 'piper' ? (
        <div className={`p-5 rounded-2xl border backdrop-blur-xl ${theme.card}`}>
          You are currently using <strong>Piper TTS</strong>. Custom voice cloning is only
          available with <strong>Chatterbox</strong>.
          <div className="mt-3">
            <Link to="/settings" className={`underline ${theme.link}`}>
              Switch engine in Settings
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className={`p-6 rounded-2xl border backdrop-blur-xl self-start ${theme.card}`}>
              <h2 className={`text-xl font-bold mb-2 ${theme.title}`}>Add Voice Sample</h2>
              <p className={`text-sm mb-6 ${theme.muted}`}>
                Upload a 6-10 second WAV file. Name it and reuse it anytime.
              </p>

              <div className="flex flex-col gap-4">
                <button
                  onClick={handleUpload}
                  className={`w-full py-4 border-2 border-dashed rounded-xl transition-all flex flex-col items-center justify-center gap-2 ${theme.secondaryButton}`}
                >
                  <span className="text-2xl">+</span>
                  <span className="font-semibold">Upload Voice Sample</span>
                </button>

                {customVoicePath && (
                  <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${theme.insetCard}`}>
                    <div className="overflow-hidden">
                      <div className={`text-xs uppercase font-bold ${theme.muted}`}>Active voice</div>
                      <div className={`text-sm truncate ${theme.body}`} title={customVoicePath}>
                        {customVoicePath.split(/[/\\]/).pop()}
                      </div>
                    </div>
                    <span className={`text-[11px] uppercase tracking-wide ${theme.accentText}`}>
                      In use
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-6 rounded-2xl border backdrop-blur-xl ${theme.card}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-xl font-bold ${theme.title}`}>Your Voice Library</h2>
                <span className={`text-xs ${theme.muted}`}>{voiceLibrary.length} samples</span>
              </div>

              {voiceLibrary.length === 0 ? (
                <div className={`text-sm rounded-xl p-4 border ${theme.insetCard}`}>
                  No saved voices yet. Upload a voice sample to build your library.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {voiceLibrary.map((sample) => {
                    const isActive = customVoicePath === sample.path
                    return (
                      <div
                        key={sample.id}
                        className={`rounded-xl border p-4 transition-all ${
                          isActive
                            ? `${theme.insetCard} ${theme.accentOutline}`
                            : theme.insetCard
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="overflow-hidden">
                            <div className={`text-xs uppercase font-semibold ${theme.muted}`}>
                              Voice Sample
                            </div>
                            <div className={`text-base font-semibold truncate ${theme.title}`}>
                              {sample.name}
                            </div>
                            <div
                              className={`text-xs mt-1 truncate ${theme.subtle}`}
                              title={sample.path}
                            >
                              {sample.path.split(/[/\\]/).pop()}
                            </div>
                          </div>
                          {isActive && (
                            <span className={`text-[10px] uppercase tracking-wide ${theme.accentText}`}>
                              Active
                            </span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleSelectVoice(sample)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              isActive
                                ? theme.accentPill
                                : theme.secondaryButton
                            }`}
                          >
                            {isActive ? 'Selected' : 'Use Voice'}
                          </button>
                          <button
                            onClick={() => handleRemoveVoice(sample)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${theme.secondaryButton}`}
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
          <div className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm px-4 ${theme.dialogBackdrop}`}>
            <div className={`w-full max-w-md rounded-2xl border p-6 shadow-[0_25px_60px_rgba(0,0,0,0.5)] ${theme.dialogCard}`}>
              <h3 className={`text-lg font-semibold ${theme.title}`}>Name this voice</h3>
              <p className={`text-sm mt-1 ${theme.muted}`}>
                Give this sample a short, memorable name.
              </p>
              <div className="mt-4">
                <label className={`text-xs uppercase tracking-wide ${theme.muted}`}>Voice name</label>
                <input
                  value={pendingVoiceName}
                  onChange={(event) => setPendingVoiceName(event.target.value)}
                  className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${theme.input}`}
                  placeholder="Studio Voice"
                />
                <div className={`text-xs mt-2 truncate ${theme.subtle}`}>
                  {pendingVoicePath.split(/[/\\]/).pop()}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelVoice}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${theme.secondaryButton}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVoice}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${theme.primaryButton}`}
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
