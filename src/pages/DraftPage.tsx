import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { exportDraftToDocx } from '../lib/docxExport'
import { supabase } from '../lib/supabase'

type DraftQuestion = {
  id: string
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_index: number
  topic?: string | null
  difficulty?: string
}

type DraftVariant = {
  index: number
  questions: DraftQuestion[]
}

type DraftData = {
  topic?: string
  variants: DraftVariant[]
  params: { variantsCount: number; perVariant: number }
}

type RemovingTarget = { variantIndex: number; questionPos: number; question: DraftQuestion }
type ReplacingTarget = { variantIndex: number; questionPos: number; question: DraftQuestion }

const replaceReasonChips = [
  'Не по теме',
  'Не проходят в этом классе',
  'Слишком сложный',
  'Слишком лёгкий',
  'Неоднозначный',
  'Другое',
]

function loadDraft(): DraftData | null {
  try {
    const raw = sessionStorage.getItem('test_draft')
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!draft?.variants?.length) return null
    return draft as DraftData
  } catch {
    return null
  }
}

function saveDraft(draft: DraftData) {
  sessionStorage.setItem('test_draft', JSON.stringify(draft))
}

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function DraftPage({ session }: { session: Session }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<DraftData | null>(() => loadDraft())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)
  const [busy, setBusy] = useState<'test' | 'answers' | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [removing, setRemoving] = useState<RemovingTarget | null>(null)
  const [replacing, setReplacing] = useState<ReplacingTarget | null>(null)
  const [replaceReason, setReplaceReason] = useState('')
  const [replaceSearching, setReplaceSearching] = useState(false)
  const [noReplacement, setNoReplacement] = useState<{ replacedTopic: string } | null>(null)

  const toastTimer = useRef<number | undefined>(undefined)

  function showToast(text: string, kind: 'ok' | 'error' = 'ok') {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ text, kind, key: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  // Обновляем вопросы черновика актуальными данными из Supabase
  // (например, после редактирования вопроса по ✏️).
  useEffect(() => {
    const current = loadDraft()
    if (!current) return
    setRefreshing(true)
    const ids = [
      ...new Set(
        current.variants.flatMap((v) => v.questions.map((q) => q.id)).filter(Boolean),
      ),
    ]
    const fresh: Record<string, DraftQuestion> = {}
    ;(async () => {
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100)
          const { data, error } = await supabase
            .from('questions')
            .select('*')
            .in('id', chunk)
            .eq('user_id', session.user.id)
          if (error) {
            console.error(`Не удалось обновить вопросы черновика: ${error.message}`)
            continue
          }
          for (const q of (data ?? []) as DraftQuestion[]) fresh[q.id] = q
        }
        current.variants.forEach((v) => {
          v.questions = v.questions.map((q) =>
            fresh[q.id] ? { ...q, ...fresh[q.id] } : q,
          )
        })
        setDraft(current)
        saveDraft(current)
      } finally {
        setRefreshing(false)
      }
    })()
    // Обновление выполняется один раз при открытии экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!draft) {
    // Нет собранного черновика — возврат к параметрам.
    return <Navigate to="/build" replace />
  }

  const perVariant = draft?.params?.perVariant ?? draft.variants[0]?.questions.length ?? 0

  function persist(updated: DraftData) {
    setDraft(updated)
    saveDraft(updated)
  }

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
      setToast({ text: 'Файл скачан', kind: 'ok', key: Date.now() })
    } catch (e) {
      console.error(`Не удалось сформировать файл: ${e instanceof Error ? e.message : String(e)}`)
      setToast({ text: 'Не удалось сформировать файл', kind: 'error', key: Date.now() })
    }
    setBusy(null)
    setTimeout(() => setToast(null), 2500)
  }

  function confirmRemove() {
    if (!removing) return
    const updated: DraftData = {
      ...draft!,
      variants: draft!.variants.map((v) => {
        if (v.index !== removing.variantIndex) return v
        const questions = [...v.questions]
        questions.splice(removing.questionPos, 1)
        return { ...v, questions }
      }),
    }
    persist(updated)
    setRemoving(null)
    showToast('Вопрос убран из черновика')
  }

  async function handleFindReplacement() {
    if (!replacing || replaceSearching) return
    const reason = replaceReason.trim()
    if (!reason) {
      showToast('Укажите причину замены', 'error')
      return
    }

    setReplaceSearching(true)
    const replaced = replacing.question
    const replacedTopic = (replaced.topic ?? '').trim().toLowerCase()
    const allowedDifficulties =
      draft?.params && 'difficulties' in (draft.params as Record<string, unknown>)
        ? ((draft.params as Record<string, unknown>).difficulties as string[])
        : undefined

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('user_id', session.user.id)
    setReplaceSearching(false)

    if (error) {
      console.error(`Поиск замены не удался: ${error.message}`)
      showToast('Не удалось выполнить поиск замены', 'error')
      return
    }

    const variant = draft!.variants.find((v) => v.index === replacing.variantIndex)
    const inVariantIds = new Set((variant?.questions ?? []).map((x) => x.id))

    const candidate = (data ?? []).find((x) => {
      const c = x as DraftQuestion
      if (c.id === replaced.id) return false
      if (inVariantIds.has(c.id)) return false
      const cTopic = (c.topic ?? '').trim().toLowerCase()
      if (replacedTopic === '' ? cTopic !== '' : cTopic !== replacedTopic) return false
      if (allowedDifficulties && allowedDifficulties.length > 0 && !allowedDifficulties.includes(c.difficulty ?? '')) return false
      return true
    }) as DraftQuestion | undefined

    if (!candidate) {
      setNoReplacement({ replacedTopic: replacedTopic })
      return
    }

    // Причина замены — в replacement_reasons (не блокируем замену при сбое)
    void supabase
      .from('replacement_reasons')
      .insert({
        user_id: session.user.id,
        replaced_question_text: replaced.text,
        reason,
      })
      .then(({ error }) => {
        if (error) console.error(`Не удалось сохранить причину замены: ${error.message}`)
      })

    const updated: DraftData = {
      ...draft!,
      variants: draft!.variants.map((v) => {
        if (v.index !== replacing.variantIndex) return v
        const questions = [...v.questions]
        questions[replacing.questionPos] = candidate
        return { ...v, questions }
      }),
    }
    persist(updated)
    setReplacing(null)
    setReplaceReason('')
    showToast('Вопрос заменён')
  }

  function questionActionBar(variantIndex: number, questionPos: number, question: DraftQuestion) {
    return (
      <div className="mb-2 flex w-full items-center justify-between border-b border-slate-100 pb-2">
        <button
          type="button"
          title="Заменить вопрос"
          onClick={(e) => {
            e.stopPropagation()
            setReplacing({ variantIndex, questionPos, question })
          }}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:text-[#0E7C6B]"
        >
          <RefreshIcon />
        </button>
        <button
          type="button"
          title="Редактировать вопрос"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/questions/${question.id}/edit?returnTo=draft`)
          }}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:text-[#0E7C6B]"
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          title="Убрать из черновика"
          onClick={(e) => {
            e.stopPropagation()
            setRemoving({ variantIndex, questionPos, question })
          }}
          className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:text-red-600"
        >
          <TrashIcon />
        </button>
      </div>
    )
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

        {refreshing && (
          <p className="mt-2 text-xs text-slate-400">
            Обновляем вопросы из банка…
          </p>
        )}

        <div className="mt-4 space-y-3">
          {draft.variants.map((variant) => {
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
                    {variant.questions.length === 0 && (
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-400">
                        В этом варианте нет вопросов
                      </p>
                    )}
                    {variant.questions.map((q, qi) => (
                      <div
                        key={`${qi}-${q.id}`}
                        className="rounded-2xl border border-slate-100 p-4"
                      >
                        {questionActionBar(variant.index, qi, q)}
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

      {removing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setRemoving(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">
              Убрать вопрос из этого черновика?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              В банке вопросов он останется.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoving(null)}
                className="cursor-pointer rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="cursor-pointer rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Убрать
              </button>
            </div>
          </div>
        </div>
      )}

      {replacing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setReplacing(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">
              Замена вопроса
            </h3>
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">
              {replacing.question.text}
            </p>

            <div className="mt-4">
              <label
                htmlFor="replace-reason"
                className="mb-1 block text-sm font-medium text-slate-600"
              >
                Причина замены
              </label>
              <textarea
                id="replace-reason"
                rows={2}
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                placeholder="Например: не по теме"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {replaceReasonChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setReplaceReason(chip)}
                    className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setReplacing(null)
                  setReplaceReason('')
                }}
                className="cursor-pointer rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleFindReplacement}
                disabled={replaceSearching}
                className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Найти замену
              </button>
            </div>
          </div>
        </div>
      )}

      {noReplacement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-800">
              В банке нет подходящих вопросов. Что делать?
            </h3>
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => {
                  if (noReplacement.replacedTopic) {
                    sessionStorage.setItem(
                      'generate_topic_prefill',
                      noReplacement.replacedTopic,
                    )
                  }
                  setNoReplacement(null)
                  navigate('/questions/generate')
                }}
                className="w-full cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
              >
                Сгенерировать через ИИ
              </button>
              <button
                type="button"
                onClick={() => {
                  setNoReplacement(null)
                  navigate('/questions/new')
                }}
                className="w-full cursor-pointer rounded-2xl border border-[#0E7C6B] bg-white px-5 py-2.5 text-sm font-medium text-[#0E7C6B] transition-colors hover:bg-teal-50"
              >
                Вписать вручную
              </button>
              <button
                type="button"
                onClick={() => setNoReplacement(null)}
                className="w-full cursor-pointer rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm text-white shadow-lg ${
            toast.kind === 'error' ? 'bg-red-600' : 'bg-slate-800'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

export default DraftPage
