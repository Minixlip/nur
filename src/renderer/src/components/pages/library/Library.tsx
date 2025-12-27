import { useState } from 'react'

export default function Library(): React.JSX.Element {
  const [status, setStatus] = useState('Idle')

  const testVoice = async (): Promise<void> => {
    try {
      setStatus('Generating...')

      // CHANGE THIS PATH to the actual path of the .onnx file on your computer
      // For this test, just put the absolute path (e.g., "C:/Users/You/Downloads/...")
      const modelPath =
        '/Users/mo/Desktop/projects/electron/nur/nur/python_backend/vits-piper-en_US-amy-low.onnx'

      // 1. Request Audio
      const audioPath = await window.api.generateSpeech(
        'Welcome to Nur Reader. Phase 3 is complete.',
        modelPath
      )

      setStatus('Playing...')
      console.log('Audio received:', audioPath)

      // 2. Play Audio
      // We need to convert the file path to a URL for the browser to play it
      const audio = new Audio(`file://${audioPath}`)
      audio.play()

      audio.onended = () => setStatus('Idle')
    } catch (e) {
      console.error(e)
      setStatus('Error: ' + e)
    }
  }

  return (
    <div className="p-10 text-white">
      <h1 className="text-3xl mb-4">Library</h1>

      <div className="bg-neutral-800 p-6 rounded-lg">
        <h2 className="text-xl mb-4">TTS System Test</h2>
        <p className="mb-4 text-gray-400">Status: {status}</p>

        <button
          onClick={testVoice}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded font-bold"
        >
          Test "Amy" Voice
        </button>
      </div>
    </div>
  )
}
