import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type CountState = { state: 'loading' | 'error' | 'done'; value?: number }

function useTableCount(table: 'questions' | 'textbooks', userId: string) {
  const [count, setCount] = useState<CountState>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count, error }) => {
        if (cancelled) return
        if (error) {
          console.error(`Счётчик «${table}» не загрузился: ${error.message}`)
          setCount({ state: 'error' })
        } else {
          setCount({ state: 'done', value: count ?? 0 })
        }
      })
    return () => {
      cancelled = true
    }
  }, [table, userId])

  return count
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function counterText(count: CountState, one: string, few: string, many: string): string {
  if (count.state === 'loading') return '…'
  if (count.state === 'error') return '—'
  return `${count.value} ${plural(count.value ?? 0, one, few, many)}`
}

const cardClass =
  'block rounded-2xl bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg'

function HomePage({ session }: { session: Session }) {
  const navigate = useNavigate()
  const email = session.user.email ?? ''
  const userName = email.split('@')[0]
  const questionsCount = useTableCount('questions', session.user.id)
  const textbooksCount = useTableCount('textbooks', session.user.id)

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0E7C6B] text-xl text-white">
              Т
            </div>
            <span className="text-xl font-bold text-slate-800">ТестоГен</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="hidden text-sm text-slate-500 sm:inline"
              title={email}
            >
              {userName}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="pt-10">
          <h1 className="text-3xl font-bold text-slate-800">Здравствуйте!</h1>
          <p className="mt-2 text-slate-500">Выберите, что хотите сделать</p>
        </section>

        <section className="mt-8 grid gap-5 pb-10 md:grid-cols-3">
          <Link to="/questions" className={cardClass}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl">
              📚
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-800">
              Банк вопросов
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {counterText(questionsCount, 'вопрос', 'вопроса', 'вопросов')}
            </p>
          </Link>

          <Link to="/textbooks" className={cardClass}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl">
              📖
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-800">
              Мои учебники
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {counterText(textbooksCount, 'учебник', 'учебника', 'учебников')}
            </p>
          </Link>

          <Link to="/settings" className={cardClass}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-2xl">
              ⚙️
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-800">
              Настройки
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Аккаунт и синхронизация
            </p>
          </Link>
        </section>
      </main>

      <footer className="pb-6 text-center text-sm text-slate-400">
        Все данные синхронизируются с мобильным приложением
      </footer>
    </div>
  )
}

export default HomePage
