import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  buildUserPrompt,
  generateQuestionsBatch,
  getStoredApiKey,
  getStoredModel,
  SYSTEM_PROMPT,
} from '../lib/openrouter'

const difficultyOptions = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'hard', label: 'Сложный' },
]

function GeneratePage({ session }: { session: Session }) {
  const navigate = useNavigate()

  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(5)
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([
    'easy',
    'medium',
    'hard',
  ])
  const [generating, setGenerating] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)

  function showToast(text: string, kind: 'ok' | 'error' = 'ok') {
    setToast({ text, kind, key: Date.now() })
  }

  function toggleDifficulty(value: string) {
    setSelectedDifficulties((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value],
    )
  }

  function clampCount(value: number): number {
    if (Number.isNaN(value)) return 1
    return Math.min(50, Math.max(1, Math.round(value)))
  }

  async function handleGenerate() {
    if (generating) return

    const apiKey = getStoredApiKey()
    if (!apiKey) {
      showToast('Сначала укажите API-ключ OpenRouter в Настройках', 'error')
      setTimeout(() => navigate('/settings'), 1200)
      return
    }
    if (!topic.trim()) {
      showToast('Введите тему', 'error')
      return
    }
    if (selectedDifficulties.length === 0) {
      showToast('Выберите хотя бы одну сложность', 'error')
      return
    }

    setGenerating(true)
    setGeneratedCount(0)

    const { saved, error } = await generateQuestionsBatch({
      apiKey,
      preferredModel: getStoredModel(),
      total: count,
      difficulties: selectedDifficulties,
      userId: session.user.id,
      topic: topic.trim(),
      source: 'ai',
      buildMessages: (portionCount, difficultyLabel) => [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt(topic.trim(), portionCount, difficultyLabel),
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

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/questions')}
            disabled={generating}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            ← Назад
          </button>
          <span className="text-xl font-bold text-slate-800">
            Генерация вопросов
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <div>
            <label htmlFor="gen-topic" className="mb-1 block text-sm font-medium text-slate-600">
              Тема
            </label>
            <input
              id="gen-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Например: Древний Рим"
              disabled={generating}
              className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
            />
          </div>

          <div className="mt-5">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Количество вопросов
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCount((v) => clampCount(v - 1))}
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
                onChange={(e) => setCount(clampCount(Number(e.target.value)))}
                disabled={generating}
                className="w-24 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-center text-lg text-slate-800 outline-none transition-colors focus:border-[#0E7C6B] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setCount((v) => clampCount(v + 1))}
                disabled={generating || count >= 50}
                className="h-11 w-11 cursor-pointer rounded-2xl border border-slate-200 bg-white text-lg font-semibold text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
              <span className="text-sm text-slate-400">от 1 до 50</span>
            </div>
            {count > 30 && (
              <p className="mt-2 text-sm text-slate-400">
                Генерация может занять несколько минут
              </p>
            )}
          </div>

          <div className="mt-6">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Сложность
            </span>
            <div className="flex flex-wrap gap-2">
              {difficultyOptions.map((d) => {
                const active = selectedDifficulties.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDifficulty(d.value)}
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

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mt-8 w-full cursor-pointer rounded-2xl bg-[#0E7C6B] px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-[#0B6355] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generating
              ? `Генерируем… ${generatedCount} из ${count}`
              : '✨ Сгенерировать'}
          </button>
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

function pluralQuestions(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'вопрос'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вопроса'
  return 'вопросов'
}

export default GeneratePage
