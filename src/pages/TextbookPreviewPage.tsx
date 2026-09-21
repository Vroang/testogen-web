import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { BlockType, ParsedDocument } from '../types/document'

const blockTypeLabels: Record<BlockType, string> = {
  heading: 'Заголовок',
  paragraph: 'Paragraph',
  header: 'Колонтитул (верх)',
  footer: 'Колонтитул (низ)',
  unknown: 'Неизвестный блок',
}

type ViewMode = 'normalized' | 'raw'

function TextbookPreviewPage() {
  const [parsed] = useState<ParsedDocument | null>(() => {
    try {
      const raw = sessionStorage.getItem('document_preview')
      if (!raw) return null
      return JSON.parse(raw) as ParsedDocument
    } catch {
      return null
    }
  })
  const [viewMode, setViewMode] = useState<ViewMode>('normalized')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  if (!parsed) {
    return <Navigate to="/textbooks" replace />
  }

  function continueAsLegacy() {
    setToast('Сохранение через новый parser — в Шаге 12.6')
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const qualityLabel =
    parsed.stats.quality === 'good'
      ? 'Хорошее'
      : parsed.stats.quality === 'medium'
        ? 'Среднее'
        : 'Низкое'

  const statRows: Array<[string, string | number]> = [
    ['Страниц', parsed.stats.pagesCount],
    ['Text items', parsed.stats.textItemsCount],
    ['Строк', parsed.stats.linesCount],
    ['Блоков', parsed.stats.blocksCount],
    ['Заголовков', parsed.stats.headingsCount],
    ['Параграфов', parsed.stats.paragraphsCount],
    ['§ найдено', parsed.stats.sectionMarkersCount],
    ['Исправлено переносов', parsed.stats.hyphensFixedCount],
    ['Повторяющихся колонтитулов', parsed.stats.repeatedHeadersCount],
    ['Качество', qualityLabel],
  ]

  // Группировка блоков по страницам (для NORMALIZED)
  const pages: Array<{
    page: number
    blocks: ParsedDocument['blocks']
  }> = []
  for (const block of parsed.blocks) {
    const last = pages[pages.length - 1]
    if (last && last.page === block.page) last.blocks.push(block)
    else pages.push({ page: block.page, blocks: [block] })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/textbooks"
            className="shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← Назад
          </Link>
          <div className="min-w-0">
            <span className="block truncate text-xl font-bold text-slate-800">
              {parsed.filename}
            </span>
            <span className="block text-xs font-medium uppercase text-slate-400">
              {parsed.format}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-10 sm:px-6">
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">
            Статистика обработки
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {statRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}:</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              Содержимое
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('normalized')}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'normalized'
                    ? 'bg-[#0E7C6B] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                }`}
              >
                NORMALIZED
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-[#0E7C6B] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                }`}
              >
                RAW
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-100 p-4">
            {viewMode === 'normalized' ? (
              <div className="space-y-5">
                {pages.map((page) => (
                  <div key={page.page}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Страница {page.page}
                    </p>
                    <div className="mt-2 space-y-3">
                      {page.blocks.map((block) => (
                        <div
                          key={block.id}
                          className="rounded-xl border border-slate-100 p-3"
                        >
                          <span className="text-xs font-medium uppercase text-slate-400">
                            [{blockTypeLabels[block.blockType]}]
                          </span>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                            {block.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {pages.length === 0 && (
                  <p className="text-sm text-slate-400">Блоков нет.</p>
                )}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-500">
                {parsed.rawText || '(пусто)'}
              </pre>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={continueAsLegacy}
          className="mt-6 w-full cursor-pointer rounded-2xl bg-[#0E7C6B] px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-[#0B6355]"
        >
          Продолжить (сохранить как обычно)
        </button>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-800 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

export default TextbookPreviewPage
