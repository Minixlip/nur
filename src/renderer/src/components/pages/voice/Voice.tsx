import { useState, useEffect } from 'react'

export default function Voice() {
  const [engine, setEngine] = useState('xtts')
  const [customVoicePath, setCustomVoicePath] = useState<string | null>(null)

  useEffect(() => {
    setEngine(localStorage.getItem('tts_engine') || 'xtts')
    setCustomVoicePath(localStorage.getItem('custom_voice_path'))
  }, [])

  const handleUpload = async () => {
    // Reuse your existing file dialog API
    const filePath = await window.api.openFileDialog()
    if (filePath) {
      setCustomVoicePath(filePath)
      localStorage.setItem('custom_voice_path', filePath)
    }
  }

  return (
    <div className="p-8 text-white">
      <h1 className="text-3xl font-bold mb-8">Voice Studio</h1>

      {engine === 'piper' ? (
        <div className="p-4 bg-yellow-900/30 text-yellow-200 rounded-lg border border-yellow-700">
          ⚠️ You are currently using <strong>Piper TTS</strong>. Custom voice cloning is only
          available with <strong>Coqui XTTS</strong>.
          <br />
          <a href="#/settings" className="underline hover:text-white">
            Switch engine in Settings
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* CUSTOM VOICE CARD */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-4">✨ Custom Voice Clone</h2>
            <p className="text-gray-400 text-sm mb-6">
              Upload a 6-10 second .wav file of anyone's voice, and the AI will mimic it instantly.
            </p>

            <div className="flex flex-col gap-4">
              <button
                onClick={handleUpload}
                className="w-full py-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-indigo-500 hover:bg-gray-750 transition-all flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">📂</span>
                <span className="font-semibold">Select Audio File</span>
              </button>

              {customVoicePath && (
                <div className="bg-emerald-900/30 p-3 rounded-lg border border-emerald-700 flex items-center gap-3">
                  <span className="text-emerald-400">✓</span>
                  <div className="overflow-hidden">
                    <div className="text-xs text-gray-400 uppercase font-bold">Active Voice</div>
                    <div className="text-sm truncate text-emerald-200" title={customVoicePath}>
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
