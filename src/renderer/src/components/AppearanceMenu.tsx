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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xl">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 text-zinc-200 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">Appearance</div>
            <div className="text-lg font-semibold text-white">Reading settings</div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
            aria-label="Close appearance menu"
          >
            X
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label className="text-xs text-zinc-400 font-semibold mb-2 block">Theme</label>
            <div className="flex gap-2">
              {[
                { id: 'light', label: 'Light', bg: 'bg-white', text: 'text-black' },
                { id: 'sepia', label: 'Sepia', bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]' },
                { id: 'dark', label: 'Dark', bg: 'bg-[#141416]', text: 'text-white' }
              ].map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id as any)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all border ${
                    settings.theme === theme.id
                      ? 'border-white/30 ring-2 ring-white/20'
                      : 'border-white/10 opacity-80 hover:opacity-100'
                  } ${theme.bg} ${theme.text}`}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-semibold mb-2 block">Font size</label>
            <div className="flex items-center gap-3 bg-black/20 p-2 rounded-lg border border-white/10">
              <button
                onClick={() => updateSetting('fontSize', Math.max(80, settings.fontSize - 10))}
                className="w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-sm"
                aria-label="Decrease font size"
              >
                A-
              </button>
              <div className="flex-1 text-center font-mono text-sm">{settings.fontSize}%</div>
              <button
                onClick={() => updateSetting('fontSize', Math.min(200, settings.fontSize + 10))}
                className="w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-lg"
                aria-label="Increase font size"
              >
                A+
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-semibold mb-2 block">Typeface</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'sans', label: 'Sans' },
                { id: 'serif', label: 'Serif' },
                { id: 'mono', label: 'Mono' }
              ].map((font) => (
                <button
                  key={font.id}
                  onClick={() => updateSetting('fontFamily', font.id as any)}
                  className={`py-2 text-sm rounded-lg border transition ${
                    settings.fontFamily === font.id
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 font-semibold mb-2 block">Spacing</label>
            <div className="grid grid-cols-3 gap-2">
              {[1.4, 1.6, 2.0].map((h) => (
                <button
                  key={h}
                  onClick={() => updateSetting('lineHeight', h)}
                  className={`py-2 rounded-lg border transition ${
                    settings.lineHeight === h
                      ? 'bg-white/10 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
