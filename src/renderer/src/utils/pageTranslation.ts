import type { VisualBlock } from '../types/book'

export const extractPageTextForTranslation = (pageBlocks: VisualBlock[] | undefined): string => {
  if (!pageBlocks || pageBlocks.length === 0) return ''

  return pageBlocks
    .filter((block) => block.type === 'paragraph')
    .map((block) => block.content.join(' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

export const splitTranslatedParagraphs = (translatedText: string): string[] =>
  translatedText
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)

export const splitTextIntoSentences = (text: string, language = 'en'): string[] => {
  const cleanText = text.trim()
  if (!cleanText) return []

  try {
    const Segmenter = Intl.Segmenter
    const segmenter = new Segmenter(language, { granularity: 'sentence' })
    const sentences = Array.from(segmenter.segment(cleanText), (segment) => segment.segment.trim())
      .filter(Boolean)

    if (sentences.length > 0) {
      return sentences
    }
  } catch {
    // Fall back to punctuation splitting for older runtimes or unsupported locales.
  }

  return cleanText
    .split(/(?<=[.!?؟。])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export const splitTranslatedSentenceBlocks = (
  translatedText: string,
  language = 'en'
): string[][] =>
  splitTranslatedParagraphs(translatedText)
    .map((paragraph) => splitTextIntoSentences(paragraph, language))
    .filter((sentences) => sentences.length > 0)
