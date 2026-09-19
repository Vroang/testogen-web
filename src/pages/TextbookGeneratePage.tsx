import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  buildTextbookUserPrompt,
  generateQuestionsBatch,
  getStoredApiKey,
  getStoredModel,
  SYSTEM_PROMPT,
  TEXTBOOK_SYSTEM_ADDITION,
} from '../lib/openrouter'
import { supabase } from '../lib/supabase'

type Textbook = {
  id: string
  name: string
  format: string
  paragraph_count: number
  uploaded_at: string
}

type Paragraph = {
  id: string
  number: number
  title: string | null
  text: string
  start_page: number
  end_page: number
}

type LoadState = 'loading' | 'error' | 'notfound' | 'ready'

const difficultyOptions = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
]

const MAX_PROMPT_TEXT = 8000

function chipToggle(active: boolean, disabled = false) {
  return `cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-[#0E7C6B] text-white'
      : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
  } ${disabled ? 'disabled:cursor-not-allowed disabled:opacity-50' : ''}`
}

/** «§ 1–3» для подряд идущих номеров, иначе «§ 1, 4, 7». */
function summarizeNumbers(numbers: number[]): string {
  if (numbers.length === 0) return ''
  const sorted = [...numbers].sort((a, b) => a - b)
  const parts: string[] = []
  let runStart = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    parts.push(runStart === prev ? `${runStart}` : `${runStart}–${prev}`)
    runStart = current
    prev = current
  }
  return parts.join(', ')
}

function pluralQuestions(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'вопрос'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вопроса'
  return 'вопросов'
}

function TextbookGeneratePage({ session }: { session: Session }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [textbook, setTextbook] = useState<Textbook | null>(null)
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])

  const [mode, setMode] = useState<'paragraphs' | 'pages'>('paragraphs')
  const [topic, setTopic] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [pageFrom, setPageFrom] = useState('')
  const [pageTo, setPageTo] = useState('')
  const [count, setCount] = useState(10)
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([
    'easy',
    'medium',
    'hard',
  ])
  const [generating, setGenerating] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    Promise.all([
      supabase
        .from('textbooks')
        .select('*')
        .eq('id', id!)
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('paragraphs')
        .select('*')
        .eq('textbook_id', id!)
        .order('number', { ascending: true }),
    ]).then(([textbookResult, paragraphResult]) => {
      if (cancelled) return
      if (textbookResult.error || paragraphResult.error) {
        const message =
          textbookResult.error?.message ??
          paragraphResult.error?.message ??
          ''
        console.error(`Не удалось загрузить учебник: ${message}`)
        setLoadState('error')
        return
      }
      if (!textbookResult.data) {
        setLoadState('notfound')
        return
      }
      setTextbook(textbookResult.data as Textbook)
      setParagraphs((paragraphResult.data ?? []) as Paragraph[])
      setLoadState('ready')
    })
    return () => {
      cancelled = true
    }
    // Загрузка выполняется при открытии экрана (и при смене id в URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session.user.id])

  function toggleParagraph(pid: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function applyRange() {
    const numbers = paragraphs.map((p) => p.number)
    const maxNumber = numbers.length ? Math.max(...numbers) : 0
    const from = rangeFrom === '' ? 1 : Number(rangeFrom)
    const to = rangeTo === '' ? maxNumber : Number(rangeTo)
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    setSelectedIds(
      new Set(
        paragraphs
          .filter((p) => p.number >= lo && p.number <= hi)
          .map((p) => p.id),
      ),
    )
  }

  const isPdf = textbook?.format === 'pdf'

  const selectedParagraphs = paragraphs.filter((p) =>
    selectedIds.has(p.id),
  )

  function pagesModeParagraphs(): Paragraph[] {
    const from = Number(pageFrom)
    const to = Number(pageTo)
    if (pageFrom === '' || pageTo === '' || Number.isNaN(from) || Number.isNaN(to)) return []
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    return paragraphs.filter(
      (p) => p.end_page >= lo && p.start_page <= hi,
    )
  }

  function autoTopic(selectedNumbers: number[]): string {
    const summary = summarizeNumbers(selectedNumbers)
    return `${textbook?.name ?? 'Учебник'} § ${summary}`
  }

  function effectiveTopic(numbers: number[]): string {
    const t = topic.trim()
    if (t) return t
    return autoTopic(numbers)
  }

  async function handleGenerate() {
    if (generating) return

    const apiKey = getStoredApiKey()
    if (!apiKey) {
      showToast('Сначала укажите API-ключ OpenRouter в Настройках', 'error')
      setTimeout(() => navigate('/settings'), 1200)
      return
    }
    if (selectedParagraphs.length === 0 && mode === 'paragraphs') {
      showToast('Выберите хотя бы один параграф', 'error')
      return
    }
    const included =
      mode === 'pages' ? pagesModeParagraphs() : selectedParagraphs
    if (included.length === 0) {
      showToast('Выберите хотя бы один параграф', 'error')
      return
    }
    if (selectedDifficulties.length === 0) {
      showToast('Выберите хотя бы одну сложность', 'error')
      return
    }

    const selectedNumbers = included.map((p) => p.number)
    const finalTopic = effectiveTopic(selectedNumbers)

    // Текст учебника: параграфы через разделитель, обрезаем до 8000 символов
    let textbookText = included
      .map((p) => `§ ${p.number}${p.title ? `. ${p.title}` : ''}\n${p.text}`)
      .join('\n\n---\n\n')
    if (textbookText.length > MAX_PROMPT_TEXT) {
      textbookText = textbookText.slice(0, MAX_PROMPT_TEXT)
    }

    setGenerating(true)
    setGeneratedCount(0)

    const { saved, error } = await generateQuestionsBatch({
      apiKey,
      preferredModel: getStoredModel(),
      total: count,
      difficulties: selectedDifficulties,
      userId: session.user.id,
      topic: finalTopic,
      source: 'pdf',
      buildMessages: (portionCount, difficultyLabel) => [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\n\n${TEXTBOOK_SYSTEM_ADDITION}`,
        },
        {
          role: 'user',
          content: buildTextbookUserPrompt(
            finalTopic,
            portionCount,
            difficultyLabel,
            textbookText,
          ),
        },
      ],
      onProgress: setGeneratedCount,
    })

    setGenerating(false)

    if (saved > 0) {
      showToast(`Добавлено ${saved} ${pluralQuestions(saved)}`)
      setTimeout(() => navigate('/questions'), 1200)
      return
    }

    if (error === 'Ключ OpenRouter неверный') {
      showToast(error, 'error')
      setTimeout(() => navigate('/settings'), 1200)
      return
    }

    showToast(error ?? 'Не удалось сгенерировать вопросы', 'error')
  }

  // Превью режима «По страницам»
  const pagesPreview = (function () {
    if (mode !== 'pages' || !isPdf) return null
    if (pageFrom === '' || pageTo === '') return null
    const included = pagesModeParagraphs()
    if (included.length === 0) return { empty: true as const, text: 'В этом диапазоне нет параграфов' }
    const numbers = included.map((p) => p.number)
    const firstPage = Math.max(
      Number(Math.min(Number(pageFrom), Number(pageTo))),
      Math.min(...included.map((p) => p.start_page)),
    )
    const lastPage = Math.min(
      Number(Math.max(Number(pageFrom), Number(pageTo))),
      Math.max(...included.map((p) => p.end_page)),
    )
    return {
      empty: false as const,
      text: `Будут включены § ${summarizeNumbers(numbers)} (страницы ${firstPage}–${lastPage})`,
    }
  })()

  const generateDisabled =
    generating ||
    (mode === 'paragraphs'
      ? selectedParagraphs.length === 0
      : !pagesPreview || pagesPreview.empty)

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(`/textbooks/${id}`)}
            disabled={generating}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            ← Назад
          </button>
          <div className="min-w-0">
            <span className="block text-xl font-bold text-slate-800">
              Генерация вопросов
            </span>
            {textbook && (
              <span className="block truncate text-xs text-slate-400">
                {textbook.name}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        {loadState === 'loading' && (
          <p className="pt-10 text-center text-slate-500">
            Загружаем учебник…
          </p>
        )}

        {loadState === 'error' && (
          <p className="pt-10 text-center text-red-600">
            Не удалось загрузить учебник. Проверьте соединение.
          </p>
        )}

        {loadState === 'notfound' && (
          <p className="pt-10 text-center text-slate-500">Учебник не найден.</p>
        )}

        {loadState === 'ready' && textbook && (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <div>
              <label htmlFor="gen-topic" className="mb-1 block text-sm font-medium text-slate-600">
                Тема вопросов
              </label>
              <input
                id="gen-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: § 4. Реформация"
                disabled={generating}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
              />
              <p className="mt-1 text-xs text-slate-400">
                Если оставить пустым, тема подставится автоматически
                (например, «{textbook.name} § 1–3»)
              </p>
            </div>

            <div className="mt-6">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                Что использовать
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode('paragraphs')}
                  disabled={generating}
                  className={chipToggle(mode === 'paragraphs', generating)}
                >
                  По параграфам
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isPdf) {
                      showToast(
                        'Выбор по страницам доступен только для PDF',
                        'error',
                      )
                      return
                    }
                    setMode('pages')
                  }}
                  disabled={generating}
                  className={chipToggle(mode === 'pages', generating)}
                >
                  По страницам
                </button>
              </div>
            </div>

            {mode === 'paragraphs' && (
              <div className="mt-6">
                <span className="mb-1 block text-sm font-medium text-slate-600">
                  Быстрый диапазон
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">От §</span>
                  <input
                    type="number"
                    min={1}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    disabled={generating}
                    className="w-20 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
                  />
                  <span className="text-sm text-slate-500">До §</span>
                  <input
                    type="number"
                    min={1}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    disabled={generating}
                    className="w-20 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={applyRange}
                    disabled={generating}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:opacity-60"
                  >
                    Выделить
                  </button>
                </div>

                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                  {paragraphs.map((p) => {
                    const checked = selectedIds.has(p.id)
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParagraph(p.id)}
                          disabled={generating}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-[#0E7C6B]"
                        />
                        <span className="min-w-0 flex-1 text-sm text-slate-700">
                          § {p.number}
                          {p.title
                            ? `. ${p.title}`
                            : ' без названия'}
                          {isPdf && (
                            <span className="text-slate-400">
                              {' '}
                              (стр. {p.start_page}–{p.end_page})
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                  {paragraphs.length === 0 && (
                    <p className="px-2 py-1 text-sm text-slate-400">
                      В этом учебнике нет параграфов.
                    </p>
                  )}
                </div>
              </div>
            )}

            {mode === 'pages' && (
              <div className="mt-6">
                <span className="mb-1 block text-sm font-medium text-slate-600">
                  Диапазон страниц
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">От стр.</span>
                  <input
                    type="number"
                    min={1}
                    value={pageFrom}
                    onChange={(e) => setPageFrom(e.target.value)}
                    disabled={generating}
                    className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
                  />
                  <span className="text-sm text-slate-500">До стр.</span>
                  <input
                    type="number"
                    min={1}
                    value={pageTo}
                    onChange={(e) => setPageTo(e.target.value)}
                    disabled={generating}
                    className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
                  />
                </div>
                {pagesPreview && (
                  <p
                    className={`mt-2 text-sm ${
                      pagesPreview.empty ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {pagesPreview.text}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                Параметры генерации
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setCount((v) => Math.max(1, Math.round(v) - 1))
                  }
                  disabled={generating || count <= 1}
                  className="h-11 w-11 cursor-pointer rounded-2xl border border-slate-200 bg-white text-lg font-semibold text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) =>
                    setCount(
                      Math.min(
                        50,
                        Math.max(1, Math.round(Number(e.target.value) || 1)),
                      ),
                    )
                  }
                  disabled={generating}
                  className="w-24 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-center text-lg text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCount((v) => Math.min(50, Math.round(v) + 1))
                  }
                  disabled={generating || count >= 50}
                  className="h-11 w-11 cursor-pointer rounded-2xl border border-slate-200 bg-white text-lg font-semibold text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
                <span className="text-sm text-slate-400">от 1 до 50</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {difficultyOptions.map((d) => {
                  const active = selectedDifficulties.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() =>
                        setSelectedDifficulties((prev) =>
                          prev.includes(d.value)
                            ? prev.filter((v) => v !== d.value)
                            : [...prev, d.value],
                        )
                      }
                      disabled={generating}
                      className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? 'bg-[#0E7C6B] text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                      }`}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={() => navigate(`/textbooks/${id}`)}
                disabled={generating}
                className="cursor-pointer rounded-2xl px-5 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateDisabled}
                className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-10 py-3 text-lg font-medium text-white transition-colors hover:bg-[#0B6355] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating
                  ? `Генерируем… ${generatedCount} из ${count}`
                  : '✨ Сгенерировать'}
              </button>
            </div>
          </div>
        )}
      </main>

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

export default TextbookGeneratePage
