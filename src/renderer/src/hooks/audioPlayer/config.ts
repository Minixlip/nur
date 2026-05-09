import { XttsQualityMode } from './types'

const DEFAULT_BATCH_RAMP = [10, 14, 20]
const DEFAULT_BATCH_SIZE_STANDARD = 40
const DEFAULT_MAX_TTS_CHARS = 200
const DEFAULT_INITIAL_BUFFER = 3
const DEFAULT_STEADY_BUFFER = 8
const DEFAULT_CROSSFADE_SEC = 0.03
const MAX_CROSSFADE_SEC = 0.12
const LOW_END_BATCH_RAMP = [6, 10, 14]
const LOW_END_BATCH_SIZE_STANDARD = 24
const LOW_END_MAX_TTS_CHARS = 140
const LOW_END_INITIAL_BUFFER = 2
const LOW_END_STEADY_BUFFER = 5
const SENTENCE_ALIGNED_BATCH_RAMP = [1, 1, 1]
const SENTENCE_ALIGNED_BATCH_SIZE_STANDARD = 1
const TTS_SPEED_STORAGE_KEY = 'tts_playback_speed'
const XTTS_QUALITY_STORAGE_KEY = 'tts_quality_mode'
const LEGACY_XTTS_QUALITY_STORAGE_KEY = 'xtts_quality_mode'
const DEFAULT_TTS_SPEED = 1.0
const MIN_TTS_SPEED = 0.85
const MAX_TTS_SPEED = 1.15
const ENABLE_PREWARM = false
const STREAM_INITIAL_PCM_BYTES = 4096
const STREAM_STEADY_PCM_BYTES = 16384
const STREAM_CHUNK_FADE_SEC = 0.008
const BACKEND_BASE_URL = 'http://127.0.0.1:8000'
const XTTS_BUFFERED_FADE_SEC = 0
const XTTS_STUDIO_MAX_TTS_CHARS = 1500
const XTTS_BALANCED_INITIAL_BUFFER_SEC = 28
const XTTS_BALANCED_STEADY_BUFFER_SEC = 42
const XTTS_STUDIO_INITIAL_BUFFER_SEC = 42
const XTTS_STUDIO_STEADY_BUFFER_SEC = 64
const XTTS_LOW_END_INITIAL_BUFFER_SEC = 20
const XTTS_LOW_END_STEADY_BUFFER_SEC = 30

const clampTtsSpeed = (value: number) => Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, value))

const getStoredTtsSpeed = () => {
  const stored = Number(localStorage.getItem(TTS_SPEED_STORAGE_KEY))
  return Number.isFinite(stored) ? clampTtsSpeed(stored) : DEFAULT_TTS_SPEED
}

const getStoredXttsQualityMode = (): XttsQualityMode => {
  const stored = localStorage.getItem(XTTS_QUALITY_STORAGE_KEY)
  if (stored === 'balanced' || stored === 'studio') {
    return stored
  }

  const legacy = localStorage.getItem(LEGACY_XTTS_QUALITY_STORAGE_KEY)
  if (legacy === 'balanced' || legacy === 'studio') {
    localStorage.setItem(XTTS_QUALITY_STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_XTTS_QUALITY_STORAGE_KEY)
    return legacy
  }

  return 'studio'
}

const getBatchRampForEngine = (
  engine: string,
  lowEndMode: boolean,
  _xttsQuality: XttsQualityMode
) => {
  if (engine === 'piper' || engine === 'chatterbox') {
    return SENTENCE_ALIGNED_BATCH_RAMP
  }

  return lowEndMode ? LOW_END_BATCH_RAMP : DEFAULT_BATCH_RAMP
}

const getBatchSizeStandardForEngine = (
  engine: string,
  lowEndMode: boolean,
  _xttsQuality: XttsQualityMode
) => {
  if (engine === 'piper' || engine === 'chatterbox') {
    return SENTENCE_ALIGNED_BATCH_SIZE_STANDARD
  }

  return lowEndMode ? LOW_END_BATCH_SIZE_STANDARD : DEFAULT_BATCH_SIZE_STANDARD
}

const shouldLockParagraphBoundariesForEngine = (
  _engine: string,
  _lowEndMode: boolean,
  _xttsQuality: XttsQualityMode
) => false

const getMaxTtsCharsForEngine = (
  engine: string,
  lowEndMode: boolean,
  xttsQuality: XttsQualityMode
) => {
  if (engine === 'chatterbox' && !lowEndMode && xttsQuality === 'studio') {
    return XTTS_STUDIO_MAX_TTS_CHARS
  }
  return lowEndMode ? LOW_END_MAX_TTS_CHARS : DEFAULT_MAX_TTS_CHARS
}

const shouldStreamXttsFirstBatch = (_lowEndMode: boolean, _xttsQuality: XttsQualityMode) => false

const getPlaybackRateForEngine = (engine: string, speed: number) => {
  if (engine === 'chatterbox') {
    return clampTtsSpeed(speed)
  }
  return 1
}

const getBufferWindowForEngine = (
  engine: string,
  initialBuffer: number,
  steadyBuffer: number
) => {
  if (engine === 'chatterbox') {
    return {
      initialBuffer: Math.max(4, Math.min(initialBuffer, 6)),
      steadyBuffer: Math.max(5, Math.min(steadyBuffer, 8))
    }
  }

  return { initialBuffer, steadyBuffer }
}

const getXttsBufferTargets = (lowEndMode: boolean, xttsQuality: XttsQualityMode) => {
  if (lowEndMode) {
    return {
      initialSeconds: XTTS_LOW_END_INITIAL_BUFFER_SEC,
      steadySeconds: XTTS_LOW_END_STEADY_BUFFER_SEC
    }
  }

  if (xttsQuality === 'studio') {
    return {
      initialSeconds: XTTS_STUDIO_INITIAL_BUFFER_SEC,
      steadySeconds: XTTS_STUDIO_STEADY_BUFFER_SEC
    }
  }

  return {
    initialSeconds: XTTS_BALANCED_INITIAL_BUFFER_SEC,
    steadySeconds: XTTS_BALANCED_STEADY_BUFFER_SEC
  }
}

export {
  DEFAULT_BATCH_RAMP,
  DEFAULT_BATCH_SIZE_STANDARD,
  DEFAULT_MAX_TTS_CHARS,
  DEFAULT_INITIAL_BUFFER,
  DEFAULT_STEADY_BUFFER,
  DEFAULT_CROSSFADE_SEC,
  MAX_CROSSFADE_SEC,
  LOW_END_BATCH_RAMP,
  LOW_END_BATCH_SIZE_STANDARD,
  LOW_END_MAX_TTS_CHARS,
  LOW_END_INITIAL_BUFFER,
  LOW_END_STEADY_BUFFER,
  DEFAULT_TTS_SPEED,
  MIN_TTS_SPEED,
  MAX_TTS_SPEED,
  ENABLE_PREWARM,
  BACKEND_BASE_URL,
  STREAM_INITIAL_PCM_BYTES,
  STREAM_STEADY_PCM_BYTES,
  STREAM_CHUNK_FADE_SEC,
  XTTS_BUFFERED_FADE_SEC,
  getStoredTtsSpeed,
  getStoredXttsQualityMode,
  getBatchRampForEngine,
  getBatchSizeStandardForEngine,
  shouldLockParagraphBoundariesForEngine,
  getMaxTtsCharsForEngine,
  shouldStreamXttsFirstBatch,
  getPlaybackRateForEngine,
  getBufferWindowForEngine,
  getXttsBufferTargets
}
