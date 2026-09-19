import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { saveAs } from 'file-saver'

export type DraftExportQuestion = {
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_index: number
}

export type DraftExportVariant = {
  index: number
  questions: DraftExportQuestion[]
}

export type DraftExportData = {
  topic?: string
  variants: DraftExportVariant[]
  params: { variantsCount: number; perVariant: number }
}

const LETTERS = ['А', 'Б', 'В', 'Г']
const FONT = 'Times New Roman'

/** Имя файла по теме: «Сталинградская Битва (Тест).docx», пусто → «ТестоГен (Тест).docx». */
export function getFileName(topic: string, kind: 'test' | 'answers'): string {
  const cleaned = (topic || '')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title = cleaned
    ? cleaned.replace(/(^|\s)\S/g, (ch) => ch.toUpperCase())
    : 'ТестоГен'
  const suffix = kind === 'test' ? 'Тест' : 'Ответы'
  return `${title} (${suffix}).docx`
}

function buildTestDocument(
  draft: DraftExportData,
  meta: { display: string; perVariant: number },
): Document {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `Тест: ${meta.display}`, bold: true, size: 36 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Всего вариантов: ${draft.variants.length} · Вопросов в каждом: ${meta.perVariant}`,
          color: '888888',
          size: 20,
        }),
      ],
    }),
  ]

  draft.variants.forEach((variant) => {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Вариант ${variant.index}`,
            bold: true,
            size: 32,
          }),
        ],
      }),
    )

    variant.questions.forEach((q, qi) => {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: `${qi + 1}. `, bold: true }),
            new TextRun({ text: q.text }),
          ],
        }),
      )
      const options = [q.option_a, q.option_b, q.option_c, q.option_d]
      options.forEach((text, i) => {
        children.push(
          new Paragraph({ children: [new TextRun({ text: `${LETTERS[i]}) ${text}` })] }),
        )
      })
      children.push(new Paragraph({ children: [] }))
    })
  })

  return new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
    },
    sections: [{ children }],
  })
}

function answerCell(text: string, bold = false, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    children: [
      new Paragraph({ children: [new TextRun({ text, bold, size: 24 })] }),
    ],
  })
}

function buildAnswersDocument(
  draft: DraftExportData,
  meta: { display: string },
): Document {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `Ответы: ${meta.display}`, bold: true, size: 36 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Всего вариантов: ${draft.variants.length}`,
          color: '888888',
          size: 20,
        }),
      ],
    }),
  ]

  draft.variants.forEach((variant) => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: `Вариант ${variant.index}`,
            bold: true,
            size: 28,
          }),
        ],
      }),
    )
    children.push(
      new Table({
        width: { size: 3200, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              answerCell('№', true, 800),
              answerCell('Ответ', true, 2400),
            ],
          }),
          ...variant.questions.map((q, qi) =>
            new TableRow({
              children: [
                answerCell(String(qi + 1), false, 800),
                answerCell(LETTERS[q.correct_index] ?? '—', false, 2400),
              ],
            }),
          ),
        ],
      }),
    )
  })

  return new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 24 } } },
    },
    sections: [{ children }],
  })
}

/** Собирает документ, сохраняет файл и возвращает его имя. */
export async function exportDraftToDocx(
  draft: DraftExportData,
  kind: 'test' | 'answers',
): Promise<string> {
  const topic = draft.topic ?? ''
  const fileName = getFileName(topic, kind)
  const meta = {
    display: getFileName(topic, 'test').replace(' (Тест).docx', ''),
    perVariant: draft.params?.perVariant ?? draft.variants[0]?.questions.length ?? 0,
  }
  const doc =
    kind === 'test'
      ? buildTestDocument(draft, meta)
      : buildAnswersDocument(draft, meta)
  const blob = await Packer.toBlob(doc)
  saveAs(blob, fileName)
  return fileName
}
