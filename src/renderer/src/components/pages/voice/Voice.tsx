import React, { useState } from 'react'

export default function Voice(): React.JSX.Element {
  const [status, setStatus] = useState('Idle')

  const story: string =
    'The town of Alderwick always smelled like rain, even on days when the sky was perfectly clear. Cobblestone streets wound between crooked houses that leaned together as if sharing secrets, their windows glowing softly at dusk. Elias walked slowly, his boots echoing in the quiet, a folded letter tucked deep inside his coat. He had read it a dozen times already, yet each step made its words feel heavier. At the edge of town stood the old clocktower, frozen at five minutes past midnight since anyone could remember. People said time behaved strangely there—that memories lingered longer, and promises made nearby had a way of coming true. Elias stopped beneath its shadow, looked up at the cracked clock face, and wondered whether this would be the night Alderwick finally decided to change him, too.'

  const handleTest = async (): Promise<void> => {
    setStatus('Requesting Audio...')
    try {
      // @ts-ignore
      const result = await window.api.generateSpeech(story, '')

      if (result.status === 'success') {
        setStatus('Playing (Check Speakers)...')
        // We don't need 'new Audio()' here anymore because
        // the Main process is running 'afplay' for us.

        // Reset status after a few seconds
        setTimeout(() => setStatus('Idle'), 5000)
      } else {
        setStatus(`Error: ${result.message}`)
      }
    } catch (err: any) {
      console.error(err)
      setStatus(`Failed: ${err.message || String(err)}`)
    }
  }

  return (
    <div className="min-h-screen p-8 text-white bg-gray-900">
      <h1 className="text-3xl font-bold mb-6">Voice Settings</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-md">
        <h2 className="text-xl mb-4">TTS System Test</h2>
        <div className="mb-4 text-gray-300">
          Status: <span className="font-mono text-yellow-400">{status}</span>
        </div>
        <button
          onClick={handleTest}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition"
        >
          Test Audio
        </button>
      </div>
    </div>
  )
}
