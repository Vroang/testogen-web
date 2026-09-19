import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  checkApiKey,
  getStoredApiKey,
  getStoredModel,
  OPENROUTER_MODELS,
  storeOpenRouterSettings,
} from '../lib/openrouter'

function SettingsPage() {
  const navigate = useNavigate()

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('openrouter/auto')
  const [showKey, setShowKey] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<
    { ok: boolean; message: string } | null
  >(null)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setApiKey(getStoredApiKey())
    setModel(getStoredModel())
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
    }
  }, [])

  function flashSaved() {
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    setSaved(true)
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
  }

  function handleSave() {
    storeOpenRouterSettings(apiKey.trim(), model)
    flashSaved()
  }

  async function handleCheck() {
    if (checking) return
    const key = apiKey.trim()
    if (!key) {
      setCheckResult({ ok: false, message: 'Сначала введите ключ' })
      return
    }
    setChecking(true)
    setCheckResult(null)
    const result = await checkApiKey(key)
    setChecking(false)
    setCheckResult({
      ok: result.ok,
      message: result.ok ? 'Ключ рабочий' : (result.message ?? 'Ключ не проверен'),
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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
          <span className="text-xl font-bold text-slate-800">Настройки</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-800">OpenRouter</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ключ нужен для генерации вопросов через ИИ. Хранится только
            в этом браузере.
          </p>

          <div className="mt-5">
            <label htmlFor="api-key" className="mb-1 block text-sm font-medium text-slate-600">
              API-ключ
            </label>
            <div className="flex gap-2">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setCheckResult(null)
                }}
                placeholder="sk-or-v1-…"
                autoComplete="off"
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-800 outline-none transition-colors focus:border-[#0E7C6B]"
              />
              <button
                type="button"
                title={showKey ? 'Скрыть ключ' : 'Показать ключ'}
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 text-lg text-slate-500 transition-colors hover:border-[#0E7C6B]"
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checking ? 'Проверяем…' : 'Проверить ключ'}
              </button>
              {checkResult && (
                <span
                  className={`text-sm font-medium ${
                    checkResult.ok ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {checkResult.ok ? '✓ ' : ''}
                  {checkResult.message}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Модель
            </span>
            <div className="flex flex-wrap gap-2">
              {OPENROUTER_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    model === m.id
                      ? 'bg-[#0E7C6B] text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-8 py-3 font-medium text-white transition-colors hover:bg-[#0B6355]"
            >
              Сохранить
            </button>
            {saved && <span className="text-sm text-green-700">Сохранено</span>}
          </div>
        </section>

        <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-800">Аккаунт</h2>
          <p className="mt-1 text-sm text-slate-500">
            После выхода нужно снова ввести email и пароль.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 cursor-pointer rounded-2xl border border-red-200 bg-white px-6 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Выйти из аккаунта
          </button>
        </section>
      </main>
    </div>
  )
}

export default SettingsPage
