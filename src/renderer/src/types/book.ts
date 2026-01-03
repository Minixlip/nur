export interface VisualBlock {
  type: 'paragraph' | 'image'
  content: string[]
  startIndex: number
}

export interface TocItem {
  label: string
  href: string
  pageIndex: number
}
