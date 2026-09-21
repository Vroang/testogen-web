import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isNewDocumentParserEnabled, setNewDocumentParserEnabled } from '../lib/featureFlags'
import {
  AUTO_MODEL_ID,
  checkApiKey,
  DEPRECATED_FREE_MODELS,
  formatPricePerMillion,
  getStoredApiKey,
  getStoredModel,
  loadModels,
  storeFallbackModels,
  storeOpenRouterSettings,
} from '../lib/openrouter'
import type { ModelInfo } from '../lib/openrouter'

function SettingsPage() {
  const navigate = useNavigate()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<
    { ok: boolean; message: string } | null
  >(null)
  const [saved, setSaved] = useState(false)
  const [model, setModel] = useState(AUTO_MODEL_ID)
  const [deprecatedModel, setDeprecatedModel] = useState(false)
  const [newParserEnabled, setNewParserEnabled] = useState(false)
  const savedTimer = useRef<number | undefined>(undefined)

  // Список моделей
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelFilter, setModelFilter] = useState<'free' | 'all'>('free')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    setApiKey(getStoredApiKey())
    setNewParserEnabled(isNewDocumentParserEnabled())
    const storedModel = getStoredModel()
    setModel(storedModel)
    setNewParserEnabled(isNewDocumentParserEnabled())
    if (DEPRECATED_FREE_MODELS.includes(storedModel)) {
      setDeprecatedModel(true)
    }
    loadModels()
      .then((list) => {
        setModels(list)
        // Резерв: первые 3 бесплатные модели из актуального списка.
        const freeIds = list.filter((m) => m.free).map((m) => m.id)
        if (freeIds.length > 0) storeFallbackModels(freeIds)
      })
      .catch((e) =>
        setModelsError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setModelsLoading(false))
  }, [])

  async function refreshModels() {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const list = await loadModels(true)
      setModels(list)
      const freeIds = list.filter((m) => m.free).map((m) => m.id)
      if (freeIds.length > 0) storeFallbackModels(freeIds)
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e))
    } finally {
      setModelsLoading(false)
    }
  }

  function flashSaved() {
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    setSaved(true)
    savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
  }

  function handleSave() {
    storeOpenRouterSettings(apiKey.trim(), model)
    flashSaved()
  }

  function selectModel(id: string) {
    setModel(id)
    localStorage.setItem('openrouter_model', id)
    setDropdownOpen(false)
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
      message: result.ok
        ? 'Ключ рабочий'
        : (result.message ?? 'Ключ не проверен'),
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  // auto всегда первым, дальше — по фильтру
  const autoEntry: ModelInfo = {
    id: AUTO_MODEL_ID,
    name: 'Auto — сама выберет модель',
    promptPrice: '0',
    completionPrice: '0',
    free: false,
  }
  const filteredModels = [
    autoEntry,
    ...models.filter((m) => m.id !== AUTO_MODEL_ID && (modelFilter === 'all' || m.free)),
  ]
  const selectedName =
    model === AUTO_MODEL_ID
      ? autoEntry.name
      : (models.find((m) => m.id === model)?.name ?? model)

  function priceLabel(m: ModelInfo): string | null {
    if (m.id === AUTO_MODEL_ID) return null
    return m.free ? 'Бесплатно' : `${formatPricePerMillion(m.promptPrice)} / ${formatPricePerMillion(m.completionPrice)} за 1M`
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
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-600">Модель</span>
              <button
                type="button"
                onClick={refreshModels}
                disabled={modelsLoading}
                className="cursor-pointer text-sm font-medium text-slate-500 transition-colors hover:text-[#0E7C6B] disabled:opacity-60"
              >
                Обновить список
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModelFilter('free')}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  modelFilter === 'free'
                    ? 'bg-[#0E7C6B] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                }`}
              >
                Только бесплатные
              </button>
              <button
                type="button"
                onClick={() => setModelFilter('all')}
                className={`cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  modelFilter === 'all'
                    ? 'bg-[#0E7C6B] text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-[#0E7C6B]'
                }`}
              >
                Все модели
              </button>
            </div>

            <div className="mt-3">
              {deprecatedModel && (
                <p className="mb-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                  Эта модель больше недоступна бесплатно. Выберите другую.
                </p>
              )}
              {modelsLoading && (
                <p className="text-sm text-slate-400">
                  Загружаем список моделей…
                </p>
              )}

              {!modelsLoading && modelsError && (
                <div>
                  <p className="text-sm text-red-600">
                    Не удалось загрузить список. Проверьте соединение.
                  </p>
                  <button
                    type="button"
                    onClick={refreshModels}
                    className="mt-2 cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
                  >
                    Повторить
                  </button>
                </div>
              )}

              {!modelsLoading && !modelsError && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((v) => !v)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left transition-colors hover:border-[#0E7C6B]"
                  >
                    <span className="truncate text-slate-800">
                      {selectedName}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {dropdownOpen ? '▲' : '▼'}
                    </span>
                  </button>

                  {dropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setDropdownOpen(false)}
                      />
                      <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {filteredModels.map((m) => {
                          const label = priceLabel(m)
                          const selected = model === m.id
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => selectModel(m.id)}
                              className={`flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
                                selected ? 'bg-teal-50' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-slate-800">
                                  {m.name}
                                </div>
                                <div className="truncate text-xs text-slate-400">
                                  {m.id}
                                </div>
                              </div>
                              {label && (
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    m.free
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {label}
                                </span>
                              )}
                              {selected && (
                                <span className="shrink-0 font-semibold text-[#0E7C6B]">
                                  ✓
                                </span>
                              )}
                            </button>
                          )
                        })}
                        {filteredModels.length === 0 && (
                          <div className="px-5 py-4 text-sm text-slate-400">
                            Нет моделей в этом фильтре
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
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
          <h2 className="text-lg font-semibold text-slate-800">
            Экспериментальные функции
          </h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              id="new-parser-flag"
              type="checkbox"
              checked={newParserEnabled}
              onChange={(e) => {
                setNewDocumentParserEnabled(e.target.checked)
                setNewParserEnabled(e.target.checked)
              }}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-[#0E7C6B]"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700">
                Использовать новый парсер документов (экспериментально)
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Старый парсер остаётся доступным. Переключение влияет
                только на обработку новых загрузок.
              </span>
            </span>
          </label>
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
