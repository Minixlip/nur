import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'nur_backend', 'dist', 'nur_engine')
const target = path.join(root, 'nur_backend', 'nur_engine')
const defaultSpeaker = path.join(root, 'nur_backend', 'default_speaker.wav')

if (!fs.existsSync(source)) {
  console.error(`[backend:sync] Missing source folder: ${source}`)
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })

if (fs.existsSync(defaultSpeaker)) {
  fs.copyFileSync(defaultSpeaker, path.join(target, 'default_speaker.wav'))
  console.log('[backend:sync] Copied default_speaker.wav')
} else {
  console.warn(`[backend:sync] default_speaker.wav not found at ${defaultSpeaker}`)
}

console.log(`[backend:sync] Copied ${source} -> ${target}`)
