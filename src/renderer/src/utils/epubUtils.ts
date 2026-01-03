// Helper to determine mime type based on file extension
export const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'svg') return 'image/svg+xml'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg' // fallback
}

// Helper to reliably find a file in the zip
export const getZipFile = (zip: any, path: string): any => {
  if (!zip || !path) return null

  // 1. Try exact path
  let file = zip.file(path)
  if (file) return file

  // 2. Try removing leading slash
  const cleanPath = path.startsWith('/') ? path.substring(1) : path
  file = zip.file(cleanPath)
  if (file) return file

  // 3. Try decoding URI components
  const decoded = decodeURIComponent(cleanPath)
  file = zip.file(decoded)
  if (file) return file

  // 4. ROBUST FALLBACK
  if (zip.files) {
    const allFiles = Object.keys(zip.files)
    for (const zipPath of allFiles) {
      if (zipPath.endsWith(cleanPath) || zipPath.endsWith(decoded)) {
        const parts = zipPath.split('/')
        const cleanParts = cleanPath.split('/')
        if (parts[parts.length - 1] === cleanParts[cleanParts.length - 1]) {
          return zip.file(zipPath)
        }
      }
    }
  }
  return null
}

// Recursive DOM walker to extract text and preserve block structure
export const extractContentRecursively = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const tagName = el.tagName.toUpperCase()

    if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'TITLE', 'LINK'].includes(tagName)) {
      return ''
    }

    let childText = ''
    el.childNodes.forEach((child) => {
      childText += extractContentRecursively(child)
    })

    const isBlock = [
      'P',
      'DIV',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'LI',
      'BLOCKQUOTE',
      'PRE',
      'FIGURE',
      'FIGCAPTION',
      'SECTION',
      'ARTICLE',
      'MAIN',
      'HEADER',
      'FOOTER'
    ].includes(tagName)

    if (isBlock) {
      return `\n\n${childText}\n\n`
    }
    return childText
  }
  return ''
}
