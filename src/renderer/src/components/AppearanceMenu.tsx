import React from 'react'
import { ReaderSettings } from '../hooks/useReaderSettings'

interface Props {
  settings: ReaderSettings
  updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
  isOpen: boolean
  onClose: () => void
}

export default function AppearanceMenu({ settings, updateSetting, isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <div className="absolute top-16 right-4 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 p-4 text-gray-200">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
        <h3 className="font-bold text-sm uppercase tracking-wider text-gray-400">Appearance</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          ✕
        </button>
      </div>

      {/* 1. THEME */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 font-bold mb-2 block">THEME</label>
        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
          {[
            { id: 'light', label: 'Light', bg: 'bg-white', text: 'text-black' },
            { id: 'sepia', label: 'Sepia', bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]' },
            { id: 'dark', label: 'Dark', bg: 'bg-gray-900', text: 'text-white' }
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => updateSetting('theme', theme.id as any)}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                settings.theme === theme.id
                  ? 'ring-2 ring-indigo-500 shadow-lg'
                  : 'opacity-70 hover:opacity-100'
              } ${theme.bg} ${theme.text}`}
            >
              Aa
            </button>
          ))}
        </div>
      </div>

      {/* 2. FONT SIZE */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 font-bold mb-2 block">FONT SIZE</label>
        <div className="flex items-center gap-3 bg-gray-900 p-2 rounded-lg border border-gray-700">
          <button
            onClick={() => updateSetting('fontSize', Math.max(80, settings.fontSize - 10))}
            className="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-sm"
          >
            A-
          </button>
          <div className="flex-1 text-center font-mono text-sm">{settings.fontSize}%</div>
          <button
            onClick={() => updateSetting('fontSize', Math.min(200, settings.fontSize + 10))}
            className="w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded text-lg"
          >
            A+
          </button>
        </div>
      </div>

      {/* 3. FONT FAMILY */}
      <div className="mb-6">
        <label className="text-xs text-gray-500 font-bold mb-2 block">TYPEFACE</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'sans', label: 'Sans' },
            { id: 'serif', label: 'Serif' },
            { id: 'mono', label: 'Mono' }
          ].map((font) => (
            <button
              key={font.id}
              onClick={() => updateSetting('fontFamily', font.id as any)}
              className={`py-2 px-1 text-sm rounded border ${
                settings.fontFamily === font.id
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. LINE HEIGHT */}
      <div>
        <label className="text-xs text-gray-500 font-bold mb-2 block">SPACING</label>
        <div className="grid grid-cols-3 gap-2">
          {[1.4, 1.6, 2.0].map((h) => (
            <button
              key={h}
              onClick={() => updateSetting('lineHeight', h)}
              className={`py-2 rounded border ${
                settings.lineHeight === h
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
