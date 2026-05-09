import { useState } from 'react'
import { ReaderAppearanceControls } from '../../ReaderAppearanceControls'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import {
  usePlaybackPreferences,
  type PlaybackQualityMode
} from '../../../hooks/usePlaybackPreferences'
import { useRuntimeStatus } from '../../../hooks/useRuntimeStatus'
import { useTtsStatus } from '../../../hooks/useTtsStatus'
import { getAppTheme } from '../../../theme/appTheme'
import { setStoredTtsEngine, type TtsEngine } from '../../../utils/tts'
import {
  PerformanceSection,
  VoiceDeliverySection
} from './SettingsPlaybackSections'
import { clampTtsSpeed } from '../../../utils/playbackBounds'
import {
  AboutPrivacySection,
  DiagnosticsSection,
  ModelStorageSection
} from './SettingsDiagnosticsSections'
import Tooltip from '../../ui/Tooltip'

export default function Settings(): React.JSX.Element {
  const { settings, updateSetting } = useReaderSettings()
  const theme = getAppTheme(settings.theme)
  const { preferences, updatePreference, resetPreferences } = usePlaybackPreferences()
  const { engine, status } = useTtsStatus(900)
  const runtime = useRuntimeStatus(2500)
  const [customVoicePath, setCustomVoicePath] = useState<string>(
    () => localStorage.getItem('custom_voice_path') || ''
  )

  const piperStatus = status.piper
  const chatterboxStatus = status.chatterbox
  const piperPath = piperStatus.path || ''
  const piperProgress = piperStatus.progress ?? 0
  const { lowEndMode } = preferences

  const handleDownload = async (engineToPrepare: TtsEngine, event?: React.MouseEvent) => {
    event?.stopPropagation()
    if (engineToPrepare === 'chatterbox') {
      setStoredTtsEngine('chatterbox')
    }
    await window.api.ensureModel(engineToPrepare)
  }

  const handleEngineChange = async (newEngine: TtsEngine) => {
    setStoredTtsEngine(newEngine)
    await window.api.ensureModel(newEngine)
  }

  const handleVoiceSelect = async () => {
    const path = await window.api.openAudioFileDialog()
    if (path) {
      setCustomVoicePath(path)
      localStorage.setItem('custom_voice_path', path)
    }
  }

  const handleResetVoice = () => {
    setCustomVoicePath('')
    localStorage.removeItem('custom_voice_path')
  }

  const handleLowEndToggle = () => {
    updatePreference('lowEndMode', !lowEndMode)
  }

  const handleInitialBufferChange = (value: number) => {
    updatePreference('initialBuffer', value)
  }

  const handleSteadyBufferChange = (value: number) => {
    updatePreference('steadyBuffer', value)
  }

  const handleCrossfadeChange = (value: number) => {
    updatePreference('crossfadeMs', value)
  }

  const handleTtsSpeedChange = (value: number) => {
    const next = clampTtsSpeed(value)
    updatePreference('speechRate', next)
  }

  const handlePremiumQualityModeChange = (mode: PlaybackQualityMode) => {
    updatePreference('qualityMode', mode)
  }

  const handleRevealPiperPath = async () => {
    if (!piperPath) return
    await window.api.revealPath(piperPath)
  }

  const handleRevealLogs = async () => {
    await window.api.revealLogs()
  }

  const handleRestartBackend = async () => {
    await window.api.restartBackend()
  }

  const handleCheckUpdates = async () => {
    await window.api.checkForUpdates()
  }

  const handleInstallUpdate = async () => {
    await window.api.quitAndInstallUpdate()
  }

  const handleOpenUserData = async () => {
    await window.api.openPath(runtime.diagnostics.userDataPath)
  }

  const handleOpenModelsDir = async () => {
    await window.api.openPath(runtime.diagnostics.modelsDir)
  }

  const handleOpenVoicesDir = async () => {
    await window.api.openPath(runtime.diagnostics.voicesDir)
  }

  const handleRevealBackendBinary = async () => {
    if (!runtime.diagnostics.backendPath) return
    await window.api.revealPath(runtime.diagnostics.backendPath)
  }

  const premiumEngineName = 'Chatterbox'

  return (
    <div className={`p-8 h-full overflow-y-auto ${theme.body}`}>
      <div className="mb-10">
        <h1 className={`text-3xl font-bold ${theme.title}`}>Settings</h1>
        <p className={`mt-1 ${theme.muted}`}>Personalize your playback and voice settings.</p>
      </div>

      <div className="w-full max-w-none space-y-8">
        <div className={`p-6 rounded-2xl border backdrop-blur-xl space-y-6 ${theme.card}`}>
          <div>
            <h2 className={`text-xl font-semibold ${theme.title}`}>Reading Appearance</h2>
            <p className={`mt-1 text-sm ${theme.muted}`}>
              These controls drive the reader page and the rest of Nur&apos;s visual theme.
            </p>
          </div>

          <ReaderAppearanceControls settings={settings} updateSetting={updateSetting} />
        </div>

        <div className={`p-6 rounded-2xl border backdrop-blur-xl space-y-6 ${theme.card}`}>
          <div className="flex justify-between items-center">
            <h2 className={`text-xl font-semibold ${theme.title}`}>Audio Engine</h2>
          </div>

          <div className="space-y-4">
            <div
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                engine === 'chatterbox'
                  ? `${theme.insetCard} ${theme.selectionRing} shadow-lg`
                  : theme.card
              }`}
            >
              <Tooltip label={`Select ${premiumEngineName}`} className="w-full">
                <button
                  onClick={() => handleEngineChange('chatterbox')}
                  className="w-full px-5 py-4 text-left flex justify-between items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className={`font-semibold text-lg flex items-center gap-2 ${theme.title}`}>
                      {premiumEngineName}
                      <span className={`text-xs px-2 py-0.5 rounded border ${theme.pill}`}>
                        HQ
                      </span>
                    </div>
                    <div className={`text-sm mt-1 ${theme.body}`}>
                      Realistic, emotive local narration. Supports cloning.
                      <span
                        className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${theme.pendingBadge}`}
                      >
                        Requires GPU
                      </span>
                    </div>
                    {status.device && (
                      <div className={`text-[11px] uppercase tracking-wide ${theme.subtle}`}>
                        Backend device: {status.device.toUpperCase()}
                      </div>
                    )}
                    {chatterboxStatus.message && !chatterboxStatus.ready && (
                      <div className={`text-xs mt-2 ${theme.muted}`}>{chatterboxStatus.message}</div>
                    )}
                  </div>
                  {chatterboxStatus.ready ? (
                    engine === 'chatterbox' ? (
                      <div className={`h-6 w-6 rounded-full ${theme.controlActive}`}></div>
                    ) : (
                      <div className={`h-6 w-6 rounded-full border-2 ${theme.controlIdle}`}></div>
                    )
                  ) : chatterboxStatus.state === 'preparing' ||
                    chatterboxStatus.state === 'downloading' ? (
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${theme.body}`}>
                        Preparing
                      </span>
                      <div className={`animate-spin h-5 w-5 rounded-full border-2 ${theme.spinner}`}></div>
                    </div>
                  ) : (
                    <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${theme.pill}`}>
                      {chatterboxStatus.state === 'error' ? 'Retry' : 'Download & Use'}
                    </div>
                  )}
                </button>
              </Tooltip>

              {engine === 'chatterbox' && chatterboxStatus.ready && (
                <div className={`px-5 pb-5 pt-2 border-t ${theme.headerBorder} ${theme.insetCard}`}>
                  <div className={`mt-3 mb-2 text-sm font-semibold ${theme.body}`}>
                    Voice Cloning (Reference Audio)
                  </div>

                  <div className="flex items-center gap-3">
                    {customVoicePath ? (
                      <div className={`flex-1 border rounded-lg p-3 flex justify-between items-center ${theme.insetCard}`}>
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs ${theme.pill}`}>
                            WAV
                          </div>
                          <div className={`truncate text-sm ${theme.body}`} title={customVoicePath}>
                            ...{customVoicePath.slice(-40)}
                          </div>
                        </div>
                        <Tooltip label="Remove custom voice">
                          <button
                            onClick={handleResetVoice}
                            className={`px-2 text-xs font-semibold ${theme.dangerText}`}
                          >
                            Remove
                          </button>
                        </Tooltip>
                      </div>
                    ) : (
                      <div className={`flex-1 text-xs italic p-3 rounded-lg border border-dashed ${theme.insetCard} ${theme.muted}`}>
                        Using the built-in {premiumEngineName} voice. Upload a short WAV file
                        (6-10s) to clone a voice.
                      </div>
                    )}

                    <Tooltip
                      label={customVoicePath ? 'Change voice reference' : 'Select voice reference'}
                    >
                      <button
                        onClick={handleVoiceSelect}
                        className={`px-4 py-2 rounded-lg text-sm font-bold shadow transition hover:-translate-y-0.5 border ${theme.primaryButton}`}
                      >
                        {customVoicePath ? 'Change Voice' : 'Select File'}
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`w-full rounded-2xl border transition-all duration-200 overflow-hidden relative ${
                engine === 'piper'
                  ? `${theme.insetCard} ${theme.selectionRing} shadow-lg scale-[1.01]`
                  : theme.card
              }`}
            >
              {piperStatus.state === 'downloading' && (
                <div className={`absolute bottom-0 left-0 h-1 w-full ${theme.progressTrack}`}>
                  <div
                    className={`h-full transition-all duration-300 ${theme.progressFill}`}
                    style={{ width: `${piperProgress}%` }}
                  />
                </div>
              )}

              {piperStatus.ready ? (
                <Tooltip label="Select Piper TTS" className="w-full">
                  <button
                    onClick={() => handleEngineChange('piper')}
                    className="w-full px-5 py-4 flex justify-between items-center gap-4 text-left"
                  >
                    <div className="space-y-1">
                      <div className={`font-semibold text-lg flex items-center gap-2 ${theme.title}`}>
                        Piper TTS
                        <span className={`text-xs px-2 py-0.5 rounded border ${theme.pill}`}>
                          FAST
                        </span>
                        <span className={`rounded border px-2 py-0.5 text-xs ${theme.accentPill}`}>
                          DEFAULT
                        </span>
                      </div>
                      <div className={`text-sm mt-1 ${theme.body}`}>
                        Ultra-fast generation. Works on any CPU.
                      </div>
                    </div>
                    {engine === 'piper' ? (
                      <div className={`h-6 w-6 rounded-full ${theme.controlActive}`}></div>
                    ) : (
                      <div className={`h-6 w-6 rounded-full border-2 transition-colors ${theme.controlIdle}`}></div>
                    )}
                  </button>
                </Tooltip>
              ) : (
                <div className="px-5 py-4 flex justify-between items-center gap-4">
                  <div className="space-y-1">
                    <div className={`font-semibold text-lg flex items-center gap-2 ${theme.title}`}>
                      Piper TTS
                      <span className={`text-xs px-2 py-0.5 rounded border ${theme.pill}`}>
                        FAST
                      </span>
                      <span className={`rounded border px-2 py-0.5 text-xs ${theme.accentPill}`}>
                        DEFAULT
                      </span>
                    </div>
                    <div className={`text-sm mt-1 ${theme.body}`}>
                      Ultra-fast generation. Works on any CPU.
                    </div>
                    <div className={`text-xs mt-2 ${theme.muted}`}>
                      {piperStatus.message || 'Downloaded automatically on first launch.'}
                    </div>
                  </div>

                  {piperStatus.state === 'downloading' ? (
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-mono ${theme.body}`}>
                        {Math.round(piperProgress)}%
                      </span>
                      <div className={`animate-spin h-5 w-5 rounded-full border-2 ${theme.spinner}`}></div>
                    </div>
                  ) : (
                    <Tooltip
                      label={
                        piperStatus.state === 'error'
                          ? 'Retry Piper download'
                          : 'Download Piper model'
                      }
                    >
                      <button
                        onClick={(event) => handleDownload('piper', event)}
                        className={`z-10 px-4 py-2 rounded-lg font-bold text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-2 border ${theme.primaryButton}`}
                      >
                        <span>
                          {piperStatus.state === 'error' ? 'Retry Download' : 'Download Model'}
                        </span>
                        <span className={`rounded px-1.5 text-xs ${theme.buttonChip}`}>~60MB</span>
                      </button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <VoiceDeliverySection
          theme={settings.theme}
          premiumEngineName={premiumEngineName}
          preferences={preferences}
          onTtsSpeedChange={handleTtsSpeedChange}
          onPremiumQualityModeChange={handlePremiumQualityModeChange}
        />

        <PerformanceSection
          theme={settings.theme}
          preferences={preferences}
          onResetPreferences={resetPreferences}
          onLowEndToggle={handleLowEndToggle}
          onInitialBufferChange={handleInitialBufferChange}
          onSteadyBufferChange={handleSteadyBufferChange}
          onCrossfadeChange={handleCrossfadeChange}
        />

        <ModelStorageSection
          theme={settings.theme}
          piperPath={piperPath}
          premiumEngineName={premiumEngineName}
          onRevealPiperPath={handleRevealPiperPath}
        />

        <DiagnosticsSection
          theme={settings.theme}
          runtime={runtime}
          status={status}
          onRevealLogs={handleRevealLogs}
          onRestartBackend={handleRestartBackend}
          onCheckUpdates={handleCheckUpdates}
          onInstallUpdate={handleInstallUpdate}
          onOpenUserData={handleOpenUserData}
          onOpenModelsDir={handleOpenModelsDir}
          onOpenVoicesDir={handleOpenVoicesDir}
          onRevealBackendBinary={handleRevealBackendBinary}
        />

        <AboutPrivacySection theme={settings.theme} runtime={runtime} />
      </div>
    </div>
  )
}
