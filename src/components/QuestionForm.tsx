import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export type QuestionFormValues = {
  topic: string
  text: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctIndex: number
  difficulty: string
  tricky: boolean
}

export type QuestionFormPayload = {
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_index: number
  difficulty: string
  tricky: boolean
  topic: string | null
}

export const emptyQuestionValues: QuestionFormValues = {
  topic: '',
  text: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctIndex: 0,
  difficulty: 'medium',
  tricky: false,
}

type FieldErrors = {
  text?: string
  optionA?: string
  optionB?: string
  optionC?: string
  optionD?: string
  correct?: string
}

const difficulties = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
]

const optionLetters = ['А', 'Б', 'В', 'Г']

const chipToggle = (active: boolean) =>
  `cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-[#0E7C6B] text-white'
      : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
  }`

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]'

const fieldLabel = 'mb-1 block text-sm font-medium text-slate-600'
const fieldError = 'mt-1 text-sm text-red-600'

function QuestionForm({
  initialValues,
  title,
  submitLabel,
  successMessage,
  cancelTo = '/questions',
  hint,
  onSubmit,
  onSuccess,
}: {
  initialValues: QuestionFormValues
  title: string
  submitLabel: string
  successMessage: string
  cancelTo?: string
  hint?: string
  onSubmit: (payload: QuestionFormPayload) => Promise<{ error: string | null }>
  onSuccess: () => void
}) {
  const [topic, setTopic] = useState(initialValues.topic)
  const [text, setText] = useState(initialValues.text)
  const [optionA, setOptionA] = useState(initialValues.optionA)
  const [optionB, setOptionB] = useState(initialValues.optionB)
  const [optionC, setOptionC] = useState(initialValues.optionC)
  const [optionD, setOptionD] = useState(initialValues.optionD)
  const [correctIndex, setCorrectIndex] = useState(initialValues.correctIndex)
  const [difficulty, setDifficulty] = useState(initialValues.difficulty)
  const [tricky, setTricky] = useState(initialValues.tricky)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  function showToast(text: string, kind: 'ok' | 'error' = 'ok') {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ text, kind, key: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!text.trim()) next.text = 'Введите текст вопроса'
    if (!optionA.trim()) next.optionA = 'Заполните вариант'
    if (!optionB.trim()) next.optionB = 'Заполните вариант'
    if (!optionC.trim()) next.optionC = 'Заполните вариант'
    if (!optionD.trim()) next.optionD = 'Заполните вариант'
    if (correctIndex < 0 || correctIndex > 3) next.correct = 'Выберите правильный ответ'
    return next
  }

  async function handleSave() {
    if (saving) return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaving(true)
    const { error } = await onSubmit({
      text: text.trim(),
      option_a: optionA.trim(),
      option_b: optionB.trim(),
      option_c: optionC.trim(),
      option_d: optionD.trim(),
      correct_index: correctIndex,
      difficulty,
      tricky,
      topic: topic.trim() || null,
    })
    setSaving(false)

    if (error) {
      console.error(`Не удалось сохранить вопрос: ${error}`)
      showToast(error, 'error')
      return
    }
    showToast(successMessage)
    onSuccess()
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to={cancelTo}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← Назад
          </Link>
          <span className="text-xl font-bold text-slate-800">{title}</span>
          {hint && (
            <span className="text-xs text-slate-400">{hint}</span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div>
            <label htmlFor="topic" className={fieldLabel}>
              Тема
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Например: Столетняя война"
              className={inputClass}
            />
          </div>

          <div className="mt-5">
            <label htmlFor="question-text" className={fieldLabel}>
              Текст вопроса
            </label>
            <textarea
              id="question-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={`${inputClass} resize-y`}
            />
            {errors.text && <p className={fieldError}>{errors.text}</p>}
          </div>

          <div className="mt-5">
            <span className={fieldLabel}>Варианты ответов</span>
            <div className="space-y-3">
              {(
                [
                  ['А', optionA, setOptionA, errors.optionA, 'Вариант А'],
                  ['Б', optionB, setOptionB, errors.optionB, 'Вариант Б'],
                  ['В', optionC, setOptionC, errors.optionC, 'Вариант В'],
                  ['Г', optionD, setOptionD, errors.optionD, 'Вариант Г'],
                ] as const
              ).map(([letter, value, setValue, error, placeholder]) => (
                <div key={letter}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600">
                      {letter}
                    </span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={placeholder}
                      className={inputClass}
                    />
                  </div>
                  {error && <p className={`${fieldError} ml-13`}>{error}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <span className={fieldLabel}>Правильный ответ</span>
            <div className="flex flex-wrap gap-2">
              {optionLetters.map((letter, i) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setCorrectIndex(i)}
                  className={chipToggle(correctIndex === i)}
                >
                  {letter}
                </button>
              ))}
            </div>
            {errors.correct && <p className={`${fieldError} mt-1`}>{errors.correct}</p>}
          </div>

          <div className="mt-6">
            <span className={fieldLabel}>Сложность</span>
            <div className="flex flex-wrap gap-2">
              {difficulties.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={chipToggle(difficulty === d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3">
            <input
              id="tricky"
              type="checkbox"
              checked={tricky}
              onChange={(e) => setTricky(e.target.checked)}
              className="mt-1 h-5 w-5 cursor-pointer accent-[#0E7C6B]"
            />
            <label htmlFor="tricky" className="cursor-pointer">
              <span className="block text-sm font-medium text-slate-800">
                С подвохом
              </span>
              <span className="block text-sm text-slate-500">
                Каверзный вопрос на внимательность
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
            <Link
              to={cancelTo}
              className="cursor-pointer rounded-2xl px-5 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
            >
              Отмена
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-10 py-3 text-lg font-medium text-white transition-colors hover:bg-[#0B6355] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Сохраняем…' : submitLabel}
            </button>
          </div>
        </div>
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

export default QuestionForm
