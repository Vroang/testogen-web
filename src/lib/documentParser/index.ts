import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { isNewDocumentParserEnabled } from '../featureFlags'
import { processTextbookFile } from '../textbookParser'
import type {
  DocumentBlock,
  DocumentStats,
  ParsedDocument,
  RawTextItem,
} from '../../types/document'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export type DocumentFormat = 'pdf' | 'docx' | 'txt'

export function detectFormat(file: File): DocumentFormat | null {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt') return 'txt'
  return null
}

/** Базовые нормализации: переносы строк и лишние пробелы. */
export function basicNormalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .trim()
}

/**
 * Каркас: один paragraph-блок на «абзац» (разделение по \n\n).
 * На Шаге 12.4 будет заменён на настоящий алгоритм.
 */
export function createPlaceholderBlocks(
  text: string,
  pagesCount: number,
): DocumentBlock[] {
  const parts = text
    .split('\n\n')
    .map((part) => part.trim())
    .filter(Boolean)
  const safePages = Math.max(1, pagesCount)
  const blocksPerPage = Math.max(1, Math.ceil(parts.length / safePages))
  return parts.map((text, orderIndex) => {
    const block: DocumentBlock = {
      id: crypto.randomUUID(),
      page: Math.min(safePages, Math.floor(orderIndex / blocksPerPage) + 1),
      blockType: 'paragraph',
      text,
      orderIndex,
    }
    return block
  })
}

export function computeStats(input: {
  pagesCount: number
  rawItems: RawTextItem[]
  normalizedText: string
  blocks: DocumentBlock[]
}): DocumentStats {
  const hasText = input.normalizedText.trim().length > 0
  return {
    pagesCount: input.pagesCount,
    textItemsCount: input.rawItems.length,
    linesCount: input.normalizedText.split('\n').length,
    blocksCount: input.blocks.length,
    headingsCount: input.blocks.filter((b) => b.blockType === 'heading').length,
    paragraphsCount: input.blocks.filter((b) => b.blockType === 'paragraph')
      .length,
    sectionMarkersCount: (input.normalizedText.match(/§\s*\d+/g) || []).length,
    hyphensFixedCount: 0,
    repeatedHeadersCount: 0,
    repeatedFootersCount: 0,
    quality: hasText ? 'medium' : 'low',
  }
}

async function extractPdf(
  file: File,
): Promise<{ rawText: string; rawItems: RawTextItem[]; pagesCount: number }> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise
  const rawItems: RawTextItem[] = []
  const pageTexts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      rawItems.push({
        page: p,
        str: item.str,
        transform: item.transform as number[] | undefined,
        width: item.width,
        height: item.height,
        hasEOL: item.hasEOL,
      })
    }
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(text)
  }
  return {
    rawText: pageTexts.join('\n\n'),
    rawItems,
    pagesCount: pdf.numPages,
  }
}

async function extractDocx(file: File): Promise<string> {
  const mod = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mod.default.extractRawText({ arrayBuffer })
  return result.value
}

function extractTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsText(file)
  })
}

/**
 * Новый pipeline обработки документов (каркас).
 * На Шаге 12.4 добавится настоящий алгоритм восстановления
 * строк/абзацев из PDF и определение заголовков.
 */
export async function processDocumentNew(file: File): Promise<ParsedDocument> {
  const format = detectFormat(file)
  if (!format) {
    return {
      filename: file.name,
      format: 'txt',
      rawText: '',
      normalizedText: '',
      blocks: [],
      rawItems: [],
      stats: computeStats({
        pagesCount: 1,
        rawItems: [],
        normalizedText: '',
        blocks: [],
      }),
      error: 'Неподдерживаемый формат файла',
    }
  }

  let rawText = ''
  let rawItems: RawTextItem[] = []
  let pagesCount = 1

  if (format === 'pdf') {
    // Пока используем СТАРЫЙ метод извлечения (pdfjs),
    // но с сохранением координат в rawItems.
    const pdf = await extractPdf(file)
    rawText = pdf.rawText
    rawItems = pdf.rawItems
    pagesCount = pdf.pagesCount
  } else if (format === 'docx') {
    rawText = await extractDocx(file)
  } else {
    rawText = await extractTxt(file)
  }

  const normalizedText = basicNormalize(rawText)

  const blocks = createPlaceholderBlocks(normalizedText, pagesCount)

  const stats = computeStats({
    pagesCount,
    rawItems,
    normalizedText,
    blocks,
  })

  return {
    filename: file.name,
    format,
    rawText,
    normalizedText,
    blocks,
    rawItems,
    stats,
  }
}

/**
 * Единая точка входа обработки документа.
 * При выключенном флаге — старый pipeline (результат оборачивается
 * в ParsedDocument, логика legacy не меняется).
 */
export async function processDocument(
  file: File,
  updateProgress?: (percent: number, stage: string) => void,
): Promise<ParsedDocument> {
  if (!isNewDocumentParserEnabled()) {
    const legacy = await processTextbookFile(
      file,
      updateProgress ?? (() => {}),
    )
    const rawText = legacy.paragraphs.map((p) => p.text).join('\n\n')
    const normalizedText = basicNormalize(rawText)
    const blocks = createPlaceholderBlocks(normalizedText, legacy.pages)
    return {
      filename: file.name,
      format: legacy.format,
      rawText,
      normalizedText,
      blocks,
      rawItems: [],
      stats: computeStats({
        pagesCount: legacy.pages,
        rawItems: [],
        normalizedText,
        blocks,
      }),
    }
  }
  return processDocumentNew(file)
}
