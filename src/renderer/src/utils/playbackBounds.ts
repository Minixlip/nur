export const MIN_TTS_SPEED = 0.85
export const MAX_TTS_SPEED = 1.15

export const clampTtsSpeed = (value: number): number =>
  Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, value))
