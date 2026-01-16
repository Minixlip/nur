import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'nur_backend', 'dist', 'nur_engine')
const target = path.join(root, 'nur_backend', 'nur_engine')

if (!fs.existsSync(source)) {
  console.error(`[backend:sync] Missing source folder: ${source}`)
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })

console.log(`[backend:sync] Copied ${source} -> ${target}`)
