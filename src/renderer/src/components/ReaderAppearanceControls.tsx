import type { ReaderSettings } from '../hooks/useReaderSettings'
import { getAppTheme } from '../theme/appTheme'

interface ReaderAppearanceControlsProps {
  settings: ReaderSettings
  updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
}

const themeOptions = [
  { id: 'light', label: 'Light', shell: 'bg-[#fbfaf6] border-black/10 text-zinc-900' },
  { id: 'sepia', label: 'Sepia', shell: 'bg-[#f4ecd8] border-black/10 text-[#5b4636]' },
  { id: 'dark', label: 'Dark', shell: 'bg-[#141416] border-white/10 text-white' }
] as const

const fontOptions = [
  { id: 'sans', label: 'Sans', fontClass: 'font-sans' },
  { id: 'serif', label: 'Serif', fontClass: 'font-serif' },
  { id: 'mono', label: 'Mono', fontClass: 'font-mono' }
] as const

const spacingOptions = [1.4, 1.6, 2.0] as const

export function ReaderAppearanceControls({
  settings,
  updateSetting
}: ReaderAppearanceControlsProps): React.JSX.Element {
  const chrome = getAppTheme(settings.theme)

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
      <section className={`rounded-3xl border p-5 ${chrome.insetCard}`}>
        <div className={`text-sm font-semibold ${chrome.title}`}>Theme</div>
        <div className={`mt-1 text-xs leading-5 ${chrome.muted}`}>
          Pick the reading atmosphere you want across the reader and the full app shell.
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const active = settings.theme === option.id
            return (
              <button
                key={option.id}
                onClick={() => updateSetting('theme', option.id)}
                className={`min-w-0 rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition ${
                  active ? `${chrome.selectionRing} ring-2 ring-black/5 dark:ring-white/10` : 'opacity-85 hover:opacity-100'
                } ${option.shell}`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className={`rounded-3xl border p-5 ${chrome.insetCard}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className={`text-sm font-semibold ${chrome.title}`}>Font Size</div>
            <div className={`mt-1 text-xs leading-5 ${chrome.muted}`}>
              Adjust the reading scale for the page and preview surfaces.
            </div>
          </div>
          <div className={`text-sm font-semibold ${chrome.title}`}>{settings.fontSize}%</div>
        </div>
        <div className={`mt-4 flex items-center gap-3 rounded-2xl border p-2 ${chrome.softCard}`}>
          <button
            onClick={() => updateSetting('fontSize', Math.max(80, settings.fontSize - 10))}
            className={`h-10 w-10 rounded-xl border text-sm transition ${chrome.secondaryButton}`}
            aria-label="Decrease font size"
          >
            A-
          </button>
          <div className={`flex-1 text-center text-sm font-medium ${chrome.body}`}>Reading scale</div>
          <button
            onClick={() => updateSetting('fontSize', Math.min(200, settings.fontSize + 10))}
            className={`h-10 w-10 rounded-xl border text-sm transition ${chrome.secondaryButton}`}
            aria-label="Increase font size"
          >
            A+
          </button>
        </div>
      </section>

      <section className={`rounded-3xl border p-5 ${chrome.insetCard}`}>
        <div className={`text-sm font-semibold ${chrome.title}`}>Typeface</div>
        <div className={`mt-1 text-xs leading-5 ${chrome.muted}`}>
          Choose the font style used in the reader layout.
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {fontOptions.map((option) => {
            const active = settings.fontFamily === option.id
            return (
              <button
                key={option.id}
                onClick={() => updateSetting('fontFamily', option.id)}
                className={`min-w-0 rounded-2xl border px-3 py-3 text-center text-sm transition ${
                  active ? chrome.accentPill : chrome.secondaryButton
                } ${option.fontClass}`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className={`rounded-3xl border p-5 ${chrome.insetCard}`}>
        <div className={`text-sm font-semibold ${chrome.title}`}>Spacing</div>
        <div className={`mt-1 text-xs leading-5 ${chrome.muted}`}>
          Control how much breathing room each line gets while reading.
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {spacingOptions.map((value) => {
            const active = settings.lineHeight === value
            return (
              <button
                key={value}
                onClick={() => updateSetting('lineHeight', value)}
                className={`min-w-0 rounded-2xl border px-3 py-3 text-center text-sm transition ${
                  active ? chrome.accentPill : chrome.secondaryButton
                }`}
              >
                {value}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
