import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { plural } from '../lib/plural'
import AppHeader from '../components/AppHeader'

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
  created_at: string
}

type LoadState = 'loading' | 'error' | 'done'
type TopicFilter = { kind: 'all' | 'none' | 'topic'; topic?: string }

const difficultyLabels: Record<string, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
  any: 'Любая сложность',
}

const difficultyChipClass: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-600',
}

const sourceLabels: Record<string, string> = {
  pdf: 'Из файла',
  ai: 'Интернет/ИИ',
  manual: 'Вручную',
}

const optionLetters = ['А', 'Б', 'В', 'Г']

const chipBase =
  'cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors'

function topicChipClass(active: boolean): string {
  return active
    ? `${chipBase} bg-[#0E7C6B] text-white`
    : `${chipBase} border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]`
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function QuestionsPage({ session }: { session: Session }) {
  const navigate = useNavigate()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [questions, setQuestions] = useState<Question[]>([])
  const [filter, setFilter] = useState<TopicFilter>({ kind: 'all' })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Question | null>(null)
  const [deletingInProgress, setDeletingInProgress] = useState(false)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  function load() {
    setLoadState('loading')
    supabase
      .from('questions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(`Не удалось загрузить вопросы: ${error.message}`)
          setLoadState('error')
          return
        }
        setQuestions((data ?? []) as Question[])
        setLoadState('done')
      })
  }

  useEffect(() => {
    load()
    // Загрузка выполняется один раз при открытии экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id])

  function showToast(text: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ text, key: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const topics = useMemo(() => {
    const set = new Set<string>()
    let hasNoTopic = false
    for (const q of questions) {
      if (q.topic && q.topic.trim()) set.add(q.topic.trim())
      else hasNoTopic = true
    }
    return {
      topics: [...set].sort((a, b) => a.localeCompare(b, 'ru')),
      hasNoTopic,
    }
  }, [questions])

  const filtered = useMemo(() => {
    if (filter.kind === 'all') return questions
    if (filter.kind === 'none')
      return questions.filter((q) => !q.topic || !q.topic.trim())
    return questions.filter((q) => q.topic?.trim() === filter.topic)
  }, [questions, filter])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function confirmDelete() {
    if (!deleting || deletingInProgress) return
    setDeletingInProgress(true)
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', deleting.id)
    setDeletingInProgress(false)
    const removed = deleting
    setDeleting(null)
    if (error) {
      console.error(`Не удалось удалить вопрос: ${error.message}`)
      showToast('Не удалось удалить вопрос')
      return
    }
    setQuestions((prev) => prev.filter((q) => q.id !== removed.id))
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.delete(removed.id)
      return next
    })
    showToast('Вопрос удалён')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <AppHeader title="Банк вопросов" email={session.user.email ?? ''} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <Link
            to="/home"
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← На главную
          </Link>
          {loadState === 'done' && (
            <span className="text-sm text-slate-500">
              Всего: {questions.length}{' '}
              {plural(questions.length, 'вопрос', 'вопроса', 'вопросов')}
            </span>
          )}
        </div>

        {loadState === 'loading' && (
          <p className="pt-10 text-center text-slate-500">Загружаем вопросы…</p>
        )}

        {loadState === 'error' && (
          <div className="pt-10 text-center">
            <p className="text-red-600">
              Не удалось загрузить вопросы. Проверьте соединение.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-4 cursor-pointer rounded-2xl bg-[#0E7C6B] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
            >
              Повторить
            </button>
          </div>
        )}

        {loadState === 'done' && questions.length === 0 && (
          <p className="pt-10 text-center text-slate-500">
            Пока нет вопросов. Их можно добавить через мобильное приложение.
          </p>
        )}

        {loadState === 'done' && questions.length > 0 && (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilter({ kind: 'all' })}
                className={topicChipClass(filter.kind === 'all')}
              >
                Все темы
              </button>
              {topics.topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setFilter({ kind: 'topic', topic })}
                  className={topicChipClass(
                    filter.kind === 'topic' && filter.topic === topic,
                  )}
                >
                  {topic}
                </button>
              ))}
              {topics.hasNoTopic && (
                <button
                  type="button"
                  onClick={() => setFilter({ kind: 'none' })}
                  className={topicChipClass(filter.kind === 'none')}
                >
                  Без темы
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="pt-10 text-center text-slate-500">
                В этой теме нет вопросов.
              </p>
            ) : (
              <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
                {filtered.map((q) => {
                  const expanded = expandedIds.has(q.id)
                  const options = [
                    q.option_a,
                    q.option_b,
                    q.option_c,
                    q.option_d,
                  ]
                  const difficultyKey = (q.difficulty ?? '')
                    .trim()
                    .toLowerCase()
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleExpanded(q.id)}
                      className="cursor-pointer rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <p
                        className={
                          expanded
                            ? 'whitespace-pre-line text-slate-800'
                            : 'line-clamp-2 text-slate-800'
                        }
                      >
                        {q.text}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            difficultyChipClass[difficultyKey] ??
                            'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {difficultyLabels[difficultyKey] ?? 'Без сложности'}
                        </span>
                        {q.tricky && (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
                            С подвохом
                          </span>
                        )}
                        {sourceLabels[q.source] && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            {sourceLabels[q.source]}
                          </span>
                        )}
                        {q.topic && q.topic.trim() && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                            {q.topic.trim()}
                          </span>
                        )}
                      </div>

                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ${
                          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="pt-4">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                title="Редактировать"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/questions/${q.id}/edit`)
                                }}
                                className="cursor-pointer rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0E7C6B]"
                              >
                                <PencilIcon />
                              </button>
                              <button
                                type="button"
                                title="Удалить"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleting(q)
                                }}
                                className="cursor-pointer rounded-xl p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <TrashIcon />
                              </button>
                            </div>

                            <div className="mt-2 space-y-2">
                              {options.map((text, i) => {
                                if (text == null || text === '') return null
                                const isCorrect = i === q.correct_index
                                return (
                                  <div
                                    key={i}
                                    className={`flex items-start gap-2 rounded-2xl px-4 py-2.5 text-sm ${
                                      isCorrect
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    <span className="font-semibold">
                                      {optionLetters[i]})
                                    </span>
                                    <span className="flex-1 whitespace-pre-line">
                                      {text}
                                    </span>
                                    {isCorrect && (
                                      <span className="font-semibold text-green-700">
                                        ✓
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800">
              Удалить вопрос?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Он удалится из мобильного приложения тоже.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="cursor-pointer rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingInProgress}
                className="cursor-pointer rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingInProgress ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-800 px-5 py-3 text-sm text-white shadow-lg"
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

export default QuestionsPage
