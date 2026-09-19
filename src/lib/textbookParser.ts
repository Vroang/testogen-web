import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export type ParsedParagraph = {
  number: number
  title: string
  text: string
  start_page: number
  end_page: number
}

export type ParseResult = {
  paragraphs: ParsedParagraph[]
  pages: number
  format: 'pdf' | 'docx' | 'txt'
}

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt']
export const MAX_FILE_SIZE = 50 * 1024 * 1024

export class NoParagraphsError extends Error {
  constructor() {
    super(
      'Не удалось найти параграфы (§) в этом файле. Убедитесь, что учебник размечен знаками §',
    )
    this.name = 'NoParagraphsError'
  }
}

function pageAt(pageStarts: number[], index: number): number {
  let page = 1
  for (let i = 0; i < pageStarts.length; i++) {
    if (pageStarts[i] <= index) page = i + 1
    else break
  }
  return page
}

/**
 * Разбивает полный текст учебника на параграфы по разметке «§ N».
 * pageStarts — индексы, с которых начинается каждая страница (для PDF);
 * для DOCX/TXT передаётся [0], lastPage = 1.
 */
export function splitIntoParagraphs(
  fullText: string,
  pageStarts: number[],
  lastPage: number,
): ParsedParagraph[] {
  const regex = /§\s*(\d+)/g
  const matches: { number: number; index: number; matchEnd: number }[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(fullText)) !== null) {
    matches.push({
      number: parseInt(match[1], 10),
      index: match.index,
      matchEnd: match.index + match[0].length,
    })
  }

  const paragraphs: ParsedParagraph[] = []
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.index : fullText.length
    const body = fullText.slice(current.matchEnd, end)
    const text = body.trim()
    if (!text) continue

    const title = body.split('\n')[0].trim().slice(0, 100)
    const startPage = pageAt(pageStarts, current.index)
    const nextStartPage = next
      ? pageAt(pageStarts, next.index)
      : lastPage + 1
    const endPage = Math.max(startPage, Math.min(lastPage, nextStartPage - 1))

    paragraphs.push({
      number: current.number,
      title,
      text,
      start_page: startPage,
      end_page: endPage,
    })
  }
  return paragraphs
}

export async function extractPdfPages(
  file: File,
  onPage: (page: number, total: number) => void,
): Promise<{ pages: string[]; totalPages: number }> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise
  const pages: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
    onPage(p, pdf.numPages)
  }
  return { pages, totalPages: pdf.numPages }
}

export async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

export function extractTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsText(file)
  })
}

/**
 * Читает файл и извлекает параграфы. updateProgress вызывается
 * по этапам: чтение файла (0-30), извлечение текста (30-60),
 * разбивка на параграфы (60-70).
 */
export async function processTextbookFile(
  file: File,
  updateProgress: (percent: number, stage: string) => void,
): Promise<ParseResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()

  updateProgress(10, 'Чтение файла')

  if (ext === 'pdf') {
    updateProgress(25, 'Чтение файла')
    const { pages, totalPages } = await extractPdfPages(file, (p, total) => {
      updateProgress(
        Math.min(55, 30 + Math.round((p / Math.max(total, 1)) * 25)),
        'Извлечение текста',
      )
    })
    updateProgress(60, 'Извлечение текста')

    const pageStarts: number[] = []
    let fullText = ''
    for (const pageText of pages) {
      pageStarts.push(fullText.length)
      fullText += pageText + '\n\n'
    }

    updateProgress(65, 'Разбивка на параграфы')
    const paragraphs = splitIntoParagraphs(fullText, pageStarts, totalPages)
    if (paragraphs.length === 0) throw new NoParagraphsError()
    updateProgress(70, 'Разбивка на параграфы')
    return { paragraphs, pages: totalPages, format: 'pdf' }
  }

  if (ext === 'docx') {
    updateProgress(30, 'Чтение файла')
    const text = await extractDocxText(file)
    updateProgress(60, 'Извлечение текста')
    updateProgress(65, 'Разбивка на параграфы')
    const paragraphs = splitIntoParagraphs(text, [0], 1)
    if (paragraphs.length === 0) throw new NoParagraphsError()
    updateProgress(70, 'Разбивка на параграфы')
    return { paragraphs, pages: 1, format: 'docx' }
  }

  // txt
  updateProgress(30, 'Чтение файла')
  const text = await extractTxt(file)
  updateProgress(60, 'Извлечение текста')
  updateProgress(65, 'Разбивка на параграфы')
  const paragraphs = splitIntoParagraphs(text, [0], 1)
  if (paragraphs.length === 0) throw new NoParagraphsError()
  updateProgress(70, 'Разбивка на параграфы')
  return { paragraphs, pages: 1, format: 'txt' }
}
