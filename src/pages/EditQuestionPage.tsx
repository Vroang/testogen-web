import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import QuestionForm from '../components/QuestionForm'
import type { QuestionFormPayload } from '../components/QuestionForm'

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

type LoadState = 'loading' | 'error' | 'ready'

function EditQuestionPage({ session }: { session: Session }) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const returnToDraft = searchParams.get('returnTo') === 'draft'

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [question, setQuestion] = useState<Question | null>(null)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

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

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    supabase
      .from('questions')
      .select('*')
      .eq('id', id!)
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error(`Не удалось загрузить вопрос: ${error.message}`)
          setLoadState('error')
          return
        }
        if (!data) {
          showToast('Вопрос не найден')
          setTimeout(() => navigate('/questions', { replace: true }), 900)
          return
        }
        setQuestion(data as Question)
        setLoadState('ready')
      })
    return () => {
      cancelled = true
    }
    // Загрузка выполняется при открытии экрана (и при смене id в URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session.user.id])

  async function handleUpdate(
    payload: QuestionFormPayload,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('questions')
      .update(payload)
      .eq('id', id!)
    if (error) {
      console.error(`Не удалось сохранить вопрос: ${error.message}`)
      return { error: 'Не удалось сохранить вопрос. Проверьте соединение.' }
    }
    return { error: null }
  }

  return (
    <>
      {loadState === 'loading' && (
        <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
          <p className="pt-10 text-center text-slate-500">Загружаем вопрос…</p>
        </div>
      )}

      {loadState === 'error' && (
        <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
          <p className="pt-10 text-center text-red-600">
            Не удалось загрузить вопрос. Проверьте соединение.
          </p>
        </div>
      )}

      {loadState === 'ready' && question && (
        <QuestionForm
          initialValues={{
            topic: question.topic ?? '',
            text: question.text,
            optionA: question.option_a ?? '',
            optionB: question.option_b ?? '',
            optionC: question.option_c ?? '',
            optionD: question.option_d ?? '',
            correctIndex: question.correct_index ?? 0,
            difficulty: question.difficulty ?? 'medium',
            tricky: !!question.tricky,
          }}
          title="Редактировать вопрос"
          submitLabel="Сохранить"
          successMessage="Вопрос обновлён"
          onSubmit={handleUpdate}
          onSuccess={() =>
            setTimeout(
              () => navigate(returnToDraft ? '/draft' : '/questions'),
              900,
            )
          }
        />
      )}

      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-800 px-5 py-3 text-sm text-white shadow-lg"
        >
          {toast.text}
        </div>
      )}
    </>
  )
}

export default EditQuestionPage
