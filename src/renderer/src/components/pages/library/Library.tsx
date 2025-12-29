import { useState } from 'react'

export default function Library(): React.JSX.Element {
  const [status, setStatus] = useState('Idle')

  // Example usage in your React component:
  const handleSpeak = async (): Promise<void> => {
    try {
      const result = await window.api.generateSpeech('Hello world, this is a test.', '')
      // The second argument "" is ignored by our new backend handler

      if (result.status === 'success') {
        const audio = new Audio(result.audio_filepath)
        audio.play()
      }
    } catch (error) {
      console.error('Speaking failed:', error)
    }
  }

  return (
    <div className="p-10 text-white">
      <h1 className="text-3xl mb-4">Library</h1>

      <div className="bg-neutral-800 p-6 rounded-lg">
        <h2 className="text-xl mb-4">TTS System Test</h2>
        <p className="mb-4 text-gray-400">Status: {status}</p>

        <button
          onClick={handleSpeak}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded font-bold"
        >
          Test "Amy" Voice
        </button>
      </div>
    </div>
  )
}
