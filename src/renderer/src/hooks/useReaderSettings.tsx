import { useState, useEffect } from 'react'

export interface ReaderSettings {
  theme: 'light' | 'dark' | 'sepia'
  fontSize: number // in percentage (e.g. 100, 110, 120)
  fontFamily: 'serif' | 'sans' | 'mono'
  lineHeight: number // e.g. 1.5, 1.8
}

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'dark',
  fontSize: 100,
  fontFamily: 'sans',
  lineHeight: 1.6
}

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('reader_settings')
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })
      } catch (e) {
        console.error('Failed to parse reader settings', e)
      }
    }
  }, [])

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem('reader_settings', JSON.stringify(settings))
  }, [settings])

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return { settings, updateSetting }
}
