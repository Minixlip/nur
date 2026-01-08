import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function Voice() {
  const [engine, setEngine] = useState('xtts')
  const [customVoicePath, setCustomVoicePath] = useState<string | null>(null)

  useEffect(() => {
    setEngine(localStorage.getItem('tts_engine') || 'xtts')
    setCustomVoicePath(localStorage.getItem('custom_voice_path'))
  }, [])

  const handleUpload = async () => {
    const filePath = await window.api.openFileDialog()
    if (filePath) {
      setCustomVoicePath(filePath)
      localStorage.setItem('custom_voice_path', filePath)
    }
  }

  return (
    <div className="p-8 text-white">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <h2 className="text-xl font-bold mb-4">Custom Voice Clone</h2>
            <p className="text-gray-400 text-sm mb-6">
              Upload a 6-10 second .wav file of a voice, and the AI will mimic it instantly.
            </p>

            <div className="flex flex-col gap-4">
              <button
                onClick={handleUpload}
                className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">+</span>
                <span className="font-semibold">Select Audio File</span>
              </button>

              {customVoicePath && (
                <div className="bg-black/20 p-3 rounded-xl border border-white/10 flex items-center gap-3">
                  <span className="text-zinc-200">Active</span>
                  <div className="overflow-hidden">
                    <div className="text-xs text-gray-400 uppercase font-bold">Voice</div>
                    <div className="text-sm truncate text-zinc-200" title={customVoicePath}>
                      {customVoicePath.split(/[/\\]/).pop()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
