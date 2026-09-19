import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { exportDraftToDocx } from '../lib/docxExport'

type DraftQuestion = {
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_index: number
}

type DraftVariant = {
  index: number
  questions: DraftQuestion[]
}

type DraftData = {
  variants: DraftVariant[]
  params: { variantsCount: number; perVariant: number }
}

function loadDraft(): DraftData | null {  try {
    const raw = sessionStorage.getItem('test_draft')
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!draft?.variants?.length) return null
    return draft as DraftData
  } catch {
    return null
  }
}

function DraftPage() {
  const [draft] = useState<DraftData | null>(loadDraft)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<'test' | 'answers' | null>(null)

  const perVariant = draft?.params?.perVariant ?? draft?.variants?.[0]?.questions?.length ?? 0

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleExport(kind: 'test' | 'answers') {
    if (!draft || busy) return
    setBusy(kind)
    try {
      await exportDraftToDocx(draft, kind)
      setToast('Файл скачан')
    } catch (e) {
      console.error(`Не удалось сформировать файл: ${e instanceof Error ? e.message : String(e)}`)
      setToast('Не удалось сформировать файл')
    }
    setBusy(null)
    setTimeout(() => setToast(null), 2500)
  }

  const variantsList = useMemo(() => draft?.variants ?? [], [draft])

  if (!draft) {
    // Нет собранного черновика — возврат к параметрам.
    return <Navigate to="/build" replace />
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/build"
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← Изменить параметры
          </Link>
          <span className="text-xl font-bold text-slate-800">Черновик</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        <p className="pt-6 text-sm text-slate-500">
          Вариантов: {draft.variants.length} · Вопросов в каждом:{' '}
          {perVariant}
        </p>

        <div className="mt-4 space-y-3">
          {variantsList.map((variant) => {
            const isOpen = expanded.has(variant.index)
            return (
              <div
                key={variant.index}
                className="cursor-pointer rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                onClick={() => toggleExpanded(variant.index)}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">
                    Вариант {variant.index}
                  </p>
                  <span className="text-sm text-slate-400">
                    {variant.questions.length}{' '}
                    {variant.questions.length === 1
                      ? 'вопрос'
                      : variant.questions.length < 5
                        ? 'вопроса'
                        : 'вопросов'}{' '}
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {isOpen && (
                  <div
                    className="mt-4 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {variant.questions.map((q, qi) => (
                      <div
                        key={qi}
                        className="rounded-2xl border border-slate-100 p-4"
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {qi + 1}. {q.text}
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {(
                            [
                              ['А', q.option_a],
                              ['Б', q.option_b],
                              ['В', q.option_c],
                              ['Г', q.option_d],
                            ] as const
                          ).map(([letter, text], i) => {
                            const isCorrect = i === q.correct_index
                            return (
                              <div
                                key={letter}
                                className={`rounded-xl px-3 py-1.5 text-sm ${
                                  isCorrect
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-slate-50 text-slate-600'
                                }`}
                              >
                                {letter}) {text}
                                {isCorrect && (
                                  <span className="ml-2 font-semibold text-green-700">
                                    ✓
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleExport('test')}
            disabled={busy !== null || draft.variants.length === 0}
            className={`rounded-2xl px-6 py-3.5 text-sm font-medium transition-colors ${
              busy === 'test'
                ? 'cursor-wait bg-[#0B6355] text-white opacity-80'
                : 'cursor-pointer bg-[#0E7C6B] text-white hover:bg-[#0B6355] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500'
            }`}
          >
            {busy === 'test' ? 'Готовим файл…' : '📥 Скачать тест (.docx)'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('answers')}
            disabled={busy !== null || draft.variants.length === 0}
            className={`rounded-2xl border px-6 py-3.5 text-sm font-medium transition-colors ${
              busy === 'answers'
                ? 'cursor-wait border-[#0E7C6B] bg-teal-50 text-[#0E7C6B] opacity-80'
                : 'cursor-pointer border-[#0E7C6B] bg-white text-[#0E7C6B] hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
            }`}
          >
            {busy === 'answers' ? 'Готовим файл…' : '📥 Скачать ответы (.docx)'}
          </button>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-800 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

export default DraftPage
