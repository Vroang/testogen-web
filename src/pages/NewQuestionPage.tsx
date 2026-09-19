import { useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import QuestionForm, {
  emptyQuestionValues,
} from '../components/QuestionForm'
import type { QuestionFormPayload } from '../components/QuestionForm'

function NewQuestionPage({ session }: { session: Session }) {
  const navigate = useNavigate()

  async function handleInsert(
    payload: QuestionFormPayload,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from('questions').insert({
      user_id: session.user.id,
      ...payload,
      source: 'manual',
    })
    if (error) {
      console.error(`Не удалось создать вопрос: ${error.message}`)
      return { error: 'Не удалось создать вопрос. Проверьте соединение.' }
    }
    return { error: null }
  }

  return (
    <QuestionForm
      initialValues={emptyQuestionValues}
      title="Новый вопрос"
      submitLabel="Создать"
      successMessage="Вопрос создан"
      onSubmit={handleInsert}
      onSuccess={() => setTimeout(() => navigate('/questions'), 900)}
    />
  )
}

export default NewQuestionPage
