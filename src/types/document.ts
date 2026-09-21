export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'header'
  | 'footer'
  | 'unknown'

export interface DocumentBlock {
  id: string // uuid
  page: number // 1-based
  blockType: BlockType
  text: string // нормализованный текст
  rawText?: string // опционально, исходный
  x?: number
  y?: number
  width?: number
  height?: number
  orderIndex: number // порядок внутри страницы
}

export interface RawTextItem {
  page: number
  str: string
  transform?: number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

export interface DocumentStats {
  pagesCount: number
  textItemsCount: number
  linesCount: number
  blocksCount: number
  headingsCount: number
  paragraphsCount: number
  sectionMarkersCount: number // количество § найдено
  hyphensFixedCount: number
  repeatedHeadersCount: number
  repeatedFootersCount: number
  quality: 'good' | 'medium' | 'low'
}

export interface ParsedDocument {
  filename: string
  format: 'pdf' | 'docx' | 'txt'
  rawText: string // RAW — как извлёк парсер
  normalizedText: string // NORMALIZED — после обработки
  blocks: DocumentBlock[] // структурированные блоки
  rawItems: RawTextItem[] // исходные text items (для PDF)
  stats: DocumentStats
  error?: string // если совсем не удалось
}
