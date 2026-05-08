import { ReaderSettings } from '../hooks/useReaderSettings'
import { getAppTheme } from '../theme/appTheme'
import { ReaderAppearanceControls } from './ReaderAppearanceControls'

interface Props {
  settings: ReaderSettings
  updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
  isOpen: boolean
  onClose: () => void
}

const getPreviewSurfaceClass = (theme: ReaderSettings['theme']) => {
  switch (theme) {
    case 'light':
      return 'bg-[#fbfaf6] border-black/10 text-zinc-900'
    case 'sepia':
      return 'bg-[#f4ecd8] border-black/10 text-[#3b2f1f]'
    default:
      return 'bg-[#17191d] border-white/10 text-zinc-100'
  }
}

const getPreviewMetaClass = (theme: ReaderSettings['theme']) => {
  switch (theme) {
    case 'light':
      return 'text-zinc-500'
    case 'sepia':
      return 'text-[#72614f]'
    default:
      return 'text-zinc-400'
  }
}

const getFontFamilyClass = (fontFamily: ReaderSettings['fontFamily']) => {
  switch (fontFamily) {
    case 'serif':
      return 'font-serif'
    case 'mono':
      return 'font-mono'
    default:
      return 'font-sans'
  }
}

export default function AppearanceMenu({
  settings,
  updateSetting,
  isOpen,
  onClose
}: Props): React.JSX.Element | null {
  if (!isOpen) return null

  const chrome = getAppTheme(settings.theme)
  const previewSurfaceClass = getPreviewSurfaceClass(settings.theme)
  const previewMetaClass = getPreviewMetaClass(settings.theme)
  const fontFamilyClass = getFontFamilyClass(settings.fontFamily)

  return (
    <div
      className={`overlay-fade-in absolute inset-0 z-50 flex justify-end backdrop-blur-xl ${chrome.dialogBackdrop}`}
      onClick={onClose}
    >
      <div
        className={`panel-slide-in-right flex h-full w-full max-w-[640px] flex-col border-l shadow-[-24px_0_80px_rgba(0,0,0,0.38)] ${chrome.dialogCard}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`border-b px-6 pb-5 pt-6 ${chrome.headerBorder}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className={`text-[11px] uppercase tracking-[0.3em] ${chrome.eyebrow}`}>
                Reader Controls
              </div>
              <h2 className={`mt-2 text-2xl font-semibold ${chrome.title}`}>Appearance</h2>
              <p className={`mt-2 max-w-sm text-sm leading-6 ${chrome.muted}`}>
                Tune the page look live while you read. The changes are saved automatically.
              </p>
            </div>
            <button
              onClick={onClose}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${chrome.secondaryButton}`}
              aria-label="Close appearance menu"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className={`rounded-[26px] border p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${previewSurfaceClass}`}>
            <div className={`text-[11px] uppercase tracking-[0.24em] ${previewMetaClass}`}>
              Live Preview
            </div>
            <div
              className={`mt-4 text-balance leading-relaxed ${fontFamilyClass}`}
              style={{ fontSize: `${Math.max(92, settings.fontSize * 0.72)}%`, lineHeight: settings.lineHeight }}
            >
              Joost adjusted the set of his coat and paused, listening for the next line to arrive
              with a little more room and calm.
            </div>
          </div>

          <div className="mt-6">
            <ReaderAppearanceControls settings={settings} updateSetting={updateSetting} />
          </div>
        </div>
      </div>
    </div>
  )
}
