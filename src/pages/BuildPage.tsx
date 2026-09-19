import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Question = {
  id: string
  text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_index: number
  difficulty: string
  tricky: boolean
  topic: string | null
  source: string
}

type LoadState = 'loading' | 'error' | 'ready'

type BuildParams = {
  mainTopic: string
  extraTopics: string[]
  variantsCount: number
  perVariant: number
  difficulties: string[]
  includeTricky: boolean
  showAnswers: boolean
}

const PARAMS_STORAGE = 'test_build_params'
const DRAFT_STORAGE = 'test_draft'

const difficultyOptions = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
]

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function loadParams(): BuildParams {
  try {
    const raw = sessionStorage.getItem(PARAMS_STORAGE)
    if (raw) return { ...JSON.parse(raw) }
  } catch {
    // повреждённые параметры — используем значения по умолчанию
  }
  return {
    mainTopic: '',
    extraTopics: [],
    variantsCount: 1,
    perVariant: 10,
    difficulties: ['easy', 'medium', 'hard'],
    includeTricky: false,
    showAnswers: true,
  }
}

function BuildPage({ session }: { session: Session }) {
  const navigate = useNavigate()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)

  const initial = useRef(loadParams())
  const [mainTopic, setMainTopic] = useState(initial.current.mainTopic)
  const [extraTopics, setExtraTopics] = useState<string[]>(initial.current.extraTopics)
  const [variantsCount, setVariantsCount] = useState(initial.current.variantsCount)
  const [perVariant, setPerVariant] = useState(initial.current.perVariant)
  const [difficulties, setDifficulties] = useState<string[]>(initial.current.difficulties)
  const [includeTricky, setIncludeTricky] = useState(initial.current.includeTricky)
  const [showAnswers, setShowAnswers] = useState(initial.current.showAnswers)

  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [topicsModal, setTopicsModal] = useState(false)
  const [modalChecked, setModalChecked] = useState<string[]>([])
  const [dialog, setDialog] = useState<
    { kind: 'no-questions' | 'not-enough'; n: number; needed: number } | null
  >(null)

  useEffect(() => {
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    supabase
      .from('questions')
      .select('id, text, option_a, option_b, option_c, option_d, correct_index, difficulty, tricky, topic, source')
      .eq('user_id', session.user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error(`Не удалось загрузить вопросы: ${error.message}`)
          setLoadState('error')
          return
        }
        setQuestions((data ?? []) as Question[])
        setLoadState('ready')
      })
    // Загрузка выполняется один раз при открытии экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id])

  // Параметры сохраняются на время сессии — «← Изменить параметры»
  // возвращает к заполненной форме.
  useEffect(() => {
    sessionStorage.setItem(
      PARAMS_STORAGE,
      JSON.stringify({
        mainTopic,
        extraTopics,
        variantsCount,
        perVariant,
        difficulties,
        includeTricky,
        showAnswers,
      }),
    )
  }, [mainTopic, extraTopics, variantsCount, perVariant, difficulties, includeTricky, showAnswers])

  const allTopics = useMemo(() => {
    const set = new Set<string>()
    for (const q of questions) {
      if (q.topic && q.topic.trim()) set.add(q.topic.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [questions])

  const autocompleteTopics = useMemo(() => {
    const query = mainTopic.trim().toLowerCase()
    return allTopics.filter((t) => !query || t.toLowerCase().includes(query))
  }, [allTopics, mainTopic])

  function matchesFilters(q: Question): boolean {
    if (!difficulties.includes(q.difficulty)) return false
    if (!includeTricky && q.tricky) return false
    return true
  }

  const needed = variantsCount * perVariant

  const mainPool = useMemo(
    () =>
      questions.filter(
        (q) =>
          matchesFilters(q) &&
          (!mainTopic.trim() || (q.topic ?? '').trim() === mainTopic.trim()),
      ),
    [questions, mainTopic, difficulties, includeTricky],
  )

  const extraPool = useMemo(() => {
    if (!mainTopic.trim() || extraTopics.length === 0) return []
    return questions.filter(
      (q) =>
        matchesFilters(q) &&
        extraTopics.includes((q.topic ?? '').trim()) &&
        (q.topic ?? '').trim() !== mainTopic.trim(),
    )
  }, [questions, mainTopic, extraTopics, difficulties, includeTricky])

  const availableN =
    mainTopic.trim() && mainPool.length < needed
      ? mainPool.length + extraPool.length
      : mainTopic.trim()
        ? mainPool.length
        : questions.filter(matchesFilters).length

  const notEnough = availableN < needed

  function buildDraft() {
    let pool = [...mainPool]
    if (pool.length < needed && extraPool.length > 0) {
      pool = [...pool, ...extraPool]
    }
    const shuffled = shuffle(pool)
    const variants = []
    for (let v = 0; v < variantsCount; v++) {
      const questionsForVariant = []
      for (let q = 0; q < perVariant; q++) {
        questionsForVariant.push(shuffled[(v * perVariant + q) % shuffled.length])
      }
      variants.push({ index: v + 1, questions: shuffle(questionsForVariant) })
    }
    sessionStorage.setItem(
      DRAFT_STORAGE,
      JSON.stringify({
        topic: mainTopic.trim(),
        variants,
        params: { variantsCount, perVariant },
      }),
    )
    navigate('/draft')
  }

  function handleCollect() {
    const totalAvailable = mainPool.length + extraPool.length

    if (mainTopic.trim() && mainPool.length === 0 && extraPool.length === 0) {
      setDialog({ kind: 'no-questions', n: 0, needed })
      return
    }
    if (!mainTopic.trim() && questions.filter(matchesFilters).length === 0) {
      setDialog({ kind: 'no-questions', n: 0, needed })
      return
    }
    if (totalAvailable < needed) {
      setDialog({ kind: 'not-enough', n: totalAvailable, needed })
      return
    }
    buildDraft()
  }

  function toggleExtraTopic(t: string) {
    setModalChecked((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    )
  }

  function openTopicsModal() {
    setModalChecked(extraTopics)
    setTopicsModal(true)
  }

  function applyTopicsModal() {
    setExtraTopics(modalChecked.filter((t) => t !== mainTopic.trim()))
    setTopicsModal(false)
  }

  function toggleDifficulty(value: string) {
    setDifficulties((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value],
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/home"
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← На главную
          </Link>
          <span className="text-xl font-bold text-slate-800">Собрать тест</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        {loadState === 'loading' && (
          <p className="pt-10 text-center text-slate-500">
            Загружаем банк вопросов…
          </p>
        )}

        {loadState === 'error' && (
          <p className="pt-10 text-center text-red-600">
            Не удалось загрузить банк вопросов. Проверьте соединение.
          </p>
        )}

        {loadState === 'ready' && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <label htmlFor="test-topic" className="mb-1 block text-sm font-medium text-slate-600">
                Тема теста
              </label>
              <div className="relative">
                <input
                  id="test-topic"
                  type="text"
                  value={mainTopic}
                  onChange={(e) => {
                    setMainTopic(e.target.value)
                    setAutocompleteOpen(true)
                  }}
                  onFocus={() => setAutocompleteOpen(true)}
                  onBlur={() => setTimeout(() => setAutocompleteOpen(false), 150)}
                  placeholder="Например: Столетняя война"
                  autoComplete="off"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]"
                />
                {autocompleteOpen && autocompleteTopics.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {autocompleteTopics.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setMainTopic(t)
                          setAutocompleteOpen(false)
                        }}
                        className="block w-full cursor-pointer px-5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-teal-50"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Если оставить пустым — будут использованы все вопросы банка
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-600">
                Дополнительные темы
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Можно взять часть вопросов из этих тем, если основной темы
                не хватит
              </p>
              {extraTopics.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extraTopics.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={openTopicsModal}
                className="mt-3 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
              >
                {extraTopics.length > 0 ? 'Изменить' : '+ Добавить'}
              </button>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">
                  Количество вариантов
                </span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={variantsCount}
                  onChange={(e) =>
                    setVariantsCount(
                      Math.min(40, Math.max(1, Math.round(Number(e.target.value) || 1))),
                    )
                  }
                  className="w-20 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]"
                />
              </div>
              <input
                type="range"
                min={1}
                max={40}
                value={variantsCount}
                onChange={(e) => setVariantsCount(Number(e.target.value))}
                className="mt-3 w-full cursor-pointer accent-[#0E7C6B]"
              />
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">
                  Вопросов в каждом варианте
                </span>
                <input
                  type="number"
                  min={5}
                  max={40}
                  value={perVariant}
                  onChange={(e) =>
                    setPerVariant(
                      Math.min(40, Math.max(5, Math.round(Number(e.target.value) || 5))),
                    )
                  }
                  className="w-20 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]"
                />
              </div>
              <input
                type="range"
                min={5}
                max={40}
                value={perVariant}
                onChange={(e) => setPerVariant(Number(e.target.value))}
                className="mt-3 w-full cursor-pointer accent-[#0E7C6B]"
              />
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                Сложность
              </span>
              <div className="flex flex-wrap gap-2">
                {difficultyOptions.map((d) => {
                  const active = difficulties.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDifficulty(d.value)}
                      className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
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

            <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={includeTricky}
                  onChange={(e) => setIncludeTricky(e.target.checked)}
                  className="mt-0.5 h-5 w-5 cursor-pointer accent-[#0E7C6B]"
                />
                <span className="text-sm text-slate-700">
                  Включать вопросы с подвохом
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={showAnswers}
                  onChange={(e) => setShowAnswers(e.target.checked)}
                  className="mt-0.5 h-5 w-5 cursor-pointer accent-[#0E7C6B]"
                />
                <span className="text-sm text-slate-700">
                  Показывать правильные ответы в конце отдельным блоком
                </span>
              </label>
            </div>

            <div
              className={`rounded-2xl px-5 py-4 text-sm ${
                notEnough
                  ? 'bg-red-50 text-red-600'
                  : 'bg-teal-50 text-teal-700'
              }`}
            >
              Будет собрано: {variantsCount}{' '}
              {variantsCount === 1 ? 'вариант' : variantsCount < 5 ? 'варианта' : 'вариантов'} ×{' '}
              {perVariant} вопросов = {needed} вопросов нужно
              {notEnough && (
                <>
                  .<br />
                  В банке только {availableN} подходящих вопросов. Некоторые
                  повторятся.
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleCollect}
              className="w-full cursor-pointer rounded-2xl bg-[#0E7C6B] px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-[#0B6355]"
            >
              ✨ Собрать тест
            </button>
          </div>
        )}
      </main>

      {topicsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setTopicsModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">
              Дополнительные темы
            </h3>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {allTopics
                .filter((t) => t !== mainTopic.trim())
                .map((t) => (
                  <label
                    key={t}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={modalChecked.includes(t)}
                      onChange={() => toggleExtraTopic(t)}
                      className="h-4 w-4 cursor-pointer accent-[#0E7C6B]"
                    />
                    <span className="text-sm text-slate-700">{t}</span>
                  </label>
                ))}
              {allTopics.filter((t) => t !== mainTopic.trim()).length === 0 && (
                <p className="text-sm text-slate-400">
                  В банке нет других тем.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={applyTopicsModal}
                className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            {dialog.kind === 'no-questions' ? (
              <>
                <h3 className="text-lg font-semibold text-slate-800">
                  {mainTopic.trim()
                    ? `По теме «${mainTopic.trim()}» нет вопросов. Сгенерировать их?`
                    : 'В банке нет вопросов. Сгенерировать их?'}
                </h3>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="cursor-pointer rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/questions/generate')}
                    className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
                  >
                    Сгенерировать
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-800">
                  В банке {dialog.n} подходящих вопросов, нужно {dialog.needed}.
                  Собрать с повторами?
                </h3>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="cursor-pointer rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/questions/generate')}
                    className="cursor-pointer rounded-2xl border border-[#0E7C6B] bg-white px-4 py-2.5 text-sm font-medium text-[#0E7C6B] transition-colors hover:bg-teal-50"
                  >
                    Сгенерировать через ИИ
                  </button>
                  <button
                    type="button"
                    onClick={buildDraft}
                    className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
                  >
                    Собрать с повторами
                  </button>
                </div>
              </>
            )}
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

export default BuildPage
