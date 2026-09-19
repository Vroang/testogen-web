import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

const errorMessages: Record<string, string> = {
  'Invalid login credentials': 'Неверный email или пароль',
  'Email not confirmed': 'Email не подтверждён. Проверьте почту',
  'User not found': 'Пользователь с таким email не найден',
}

function translateError(message: string): string {
  if (errorMessages[message]) return errorMessages[message]
  if (message.includes('Failed to fetch')) {
    return 'Нет соединения с сервером. Проверьте интернет'
  }
  return message
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setError(translateError(error.message))
      setSubmitting(false)
    }
    // При успехе сработает onAuthStateChange и приложение само
    // перенаправит на главный экран.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white">
          Т
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-800">
          ТестоГен
        </h1>
        <p className="mt-2 text-center text-slate-500">
          Войдите, чтобы продолжить
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-lg text-slate-800 outline-none transition-colors focus:border-teal-600"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Пароль
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-lg text-slate-800 outline-none transition-colors focus:border-teal-600"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-2xl bg-red-50 px-5 py-3 text-center text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full cursor-pointer rounded-2xl bg-teal-600 px-8 py-3 text-lg font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
