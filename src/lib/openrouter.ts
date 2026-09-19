import { supabase } from './supabase'

export const OPENROUTER_KEY_STORAGE = 'openrouter_api_key'
export const OPENROUTER_MODEL_STORAGE = 'openrouter_model'
export const FALLBACK_MODELS_STORAGE = 'openrouter_fallback_models'

// Резерв по умолчанию (используется, пока список моделей ни разу
// не загружался в настройках). Проверен по каталогу OpenRouter;
// динамический резерв обновляется при загрузке списка моделей.
export const DEFAULT_FALLBACK_MODELS = [
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'deepseek/deepseek-v4-flash-0731:free',
]

/** Модели, снятые с бесплатного тарифа — не используем и предупреждаем. */
export const DEPRECATED_FREE_MODELS = ['meta-llama/llama-3.3-70b-instruct:free']

export function getStoredApiKey(): string {
  return localStorage.getItem(OPENROUTER_KEY_STORAGE) ?? ''
}

export function getStoredModel(): string {
  return localStorage.getItem(OPENROUTER_MODEL_STORAGE) || 'openrouter/auto'
}

export function storeOpenRouterSettings(apiKey: string, model: string) {
  if (apiKey) localStorage.setItem(OPENROUTER_KEY_STORAGE, apiKey)
  else localStorage.removeItem(OPENROUTER_KEY_STORAGE)
  localStorage.setItem(OPENROUTER_MODEL_STORAGE, model)
}

export type GeneratedQuestion = {
  text: string
  options: string[]
  correct: number
}

export type ChatMessage = { role: 'system' | 'user'; content: string }

export const SYSTEM_PROMPT = `Ты — генератор школьных тестов по истории и обществознанию. Твоя задача — составить вопросы с вариантами ответов.

ПРАВИЛА:
- Ровно 4 варианта ответа на каждый вопрос.
- Только один правильный вариант.
- Вопросы чёткие, без двусмысленности.
- Правильный ответ НЕ всегда первый — распределяй позицию (А/Б/В/Г) случайно.
- Никаких вопросов «все перечисленное верно» / «ничего из перечисленного».

ФОРМАТ ОТВЕТА — строго JSON-массив, без markdown-обёрток:
[
  {"text": "...",
   "options": ["...", "...", "...", "..."],
   "correct": 0}
]
где correct — индекс правильного варианта (0-3).`

export const TEXTBOOK_SYSTEM_ADDITION = `Используй ТОЛЬКО приведённый ниже текст учебника и указанную тему. Не придумывай факты, которых нет в тексте. Если в тексте недостаточно материала для N вопросов — сделай сколько сможешь.`

export function buildUserPrompt(
  topic: string,
  count: number,
  difficultyLabel: string,
): string {
  return `Тема: ${topic}
Количество вопросов: ${count}
Сложность: ${difficultyLabel}

Верни JSON-массив вопросов.`
}

export function buildTextbookUserPrompt(
  topic: string,
  count: number,
  difficultyLabel: string,
  textbookText: string,
): string {
  return `Тема: ${topic}
Количество вопросов: ${count}
Сложность: ${difficultyLabel}

Текст учебника:
${textbookText}

Верни JSON-массив вопросов: [{"text": "...", "options": ["...", "...", "...", "..."], "correct": 0-3}, ...]`
}

function isValidQuestion(q: unknown): q is GeneratedQuestion {
  if (!q || typeof q !== 'object') return false
  const question = q as Record<string, unknown>
  return (
    typeof question.text === 'string' &&
    question.text.trim() !== '' &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    question.options.every(
      (o) => typeof o === 'string' && o.trim() !== '',
    ) &&
    typeof question.correct === 'number' &&
    Number.isInteger(question.correct) &&
    question.correct >= 0 &&
    question.correct <= 3
  )
}

export function parseQuestions(raw: string): GeneratedQuestion[] {
  const content = raw.replace(/```(?:json)?/gi, '')
  const start = content.indexOf('[')
  const end = content.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(content.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidQuestion)
  } catch {
    return []
  }
}

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.,;:«»"')]+$/g, '')
    .trim()
}

export type ModelInfo = {
  id: string
  name: string
  promptPrice: string
  completionPrice: string
  free: boolean
}

export const MODELS_CACHE_STORAGE = 'openrouter_models_cache'
export const AUTO_MODEL_ID = 'openrouter/auto'
const MODELS_CACHE_TTL = 60 * 60 * 1000

export function formatPricePerMillion(price: string): string {
  const value = parseFloat(price)
  if (Number.isNaN(value)) return '$0.00'
  return `$${(value * 1_000_000).toFixed(2)}`
}

export async function loadModels(force = false): Promise<ModelInfo[]> {
  if (!force) {
    const raw = localStorage.getItem(MODELS_CACHE_STORAGE)
    if (raw) {
      try {
        const cache = JSON.parse(raw)
        if (
          Array.isArray(cache?.models) &&
          cache.models.length > 0 &&
          Date.now() - (cache.ts ?? 0) < MODELS_CACHE_TTL
        ) {
          return cache.models as ModelInfo[]
        }
      } catch {
        // повреждённый кэш игнорируем и загружаем заново
      }
    }
  }

  const res = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/models',
    {},
    20000,
  )
  if (!res.ok) {
    throw new Error(`OpenRouter ответил ошибкой (${res.status})`)
  }
  const data = await res.json()
  const rawModels: Array<Record<string, any>> = Array.isArray(data?.data)
    ? data.data
    : []
  const models: ModelInfo[] = rawModels
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => {
      const promptPrice = String(m.pricing?.prompt ?? '0')
      const completionPrice = String(m.pricing?.completion ?? '0')
      return {
        id: m.id,
        name:
          typeof m.name === 'string' && m.name ? m.name : (m.id as string),
        promptPrice,
        completionPrice,
        free:
          m.id.endsWith(':free') ||
          (promptPrice === '0' && completionPrice === '0'),
      }
    })

  const free = models
    .filter((m) => m.free)
    .sort((a, b) => a.name.localeCompare(b.name))
  const paid = models
    .filter((m) => !m.free)
    .sort(
      (a, b) =>
        parseFloat(a.promptPrice || '0') - parseFloat(b.promptPrice || '0'),
    )
  const sorted = [...free, ...paid]

  localStorage.setItem(
    MODELS_CACHE_STORAGE,
    JSON.stringify({ ts: Date.now(), models: sorted }),
  )
  return sorted
}

export async function checkApiKey(
  apiKey: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/key',
      { headers: { Authorization: `Bearer ${apiKey}` } },
      15000,
    )
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, message: 'Ключ неверный' }
    return { ok: false, message: `OpenRouter ответил ошибкой (${res.status})` }
  } catch {
    return { ok: false, message: 'Нет соединения с OpenRouter' }
  }
}

export type PortionResult =
  | { kind: 'ok'; questions: GeneratedQuestion[]; model: string }
  | { kind: 'error'; message: string }

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ядро каскада: перебирает модели (выбранная → резерв), на каждый
 * запрос — таймаут 60 сек. content обрабатывается через parseQuestions;
 * пустой результат считается неудачей модели и перебор продолжается.
 * Ошибки вида «модель недоступна бесплатно» (404/410) пропускаются
 * молча — они не становятся итоговым сообщением.
 */
export async function requestQuestionsFromAI({
  apiKey,
  preferredModel,
  messages,
}: {
  apiKey: string
  preferredModel: string
  messages: ChatMessage[]
}): Promise<PortionResult> {
  const fallbacks = getFallbackModels()
  const modelOrder = [preferredModel]
  for (const m of [...fallbacks, ...DEFAULT_FALLBACK_MODELS]) {
    if (m !== preferredModel && !modelOrder.includes(m)) modelOrder.push(m)
  }
  let lastError: string | null = null
  let unavailableSkipped = 0

  for (const model of modelOrder) {
    try {
      const res = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model, messages }),
        },
        60000,
      )

      if (res.status === 401) {
        lastError = 'Ключ OpenRouter неверный'
        continue
      }
      if (!res.ok) {
        let message = `Ошибка OpenRouter (${res.status})`
        try {
          const body = await res.json()
          if (body?.error?.message) message = body.error.message
        } catch {
          // тело не JSON — оставляем общий текст
        }
        if (
          res.status === 404 ||
          res.status === 410 ||
          /unavailable for free/i.test(message)
        ) {
          // Модель недоступна — молча пробуем следующую.
          unavailableSkipped += 1
          continue
        }
        lastError = message
        continue
      }

      const data = await res.json()
      const content: string = data?.choices?.[0]?.message?.content ?? ''
      const questions = parseQuestions(content)
      if (questions.length === 0) {
        lastError =
          'Модель вернула ответ, из которого не удалось извлечь вопросы'
        continue
      }
      return { kind: 'ok', questions, model }
    } catch (e) {
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') {
        lastError = 'OpenRouter не ответил за 60 секунд'
      } else if (e instanceof TypeError) {
        lastError = 'Нет соединения с OpenRouter. Проверьте интернет'
      } else {
        lastError = String(e)
      }
    }
  }

  if (!lastError) {
    lastError =
      unavailableSkipped > 0
        ? 'Доступные модели сейчас не работают'
        : 'Не удалось связаться с OpenRouter'
  }
  return {
    kind: 'error',
    message: `${lastError}. Попробуйте выбрать другую модель в Настройках`,
  }
}

function getFallbackModels(): string[] {
  try {
    const raw = localStorage.getItem(FALLBACK_MODELS_STORAGE)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((m) => typeof m === 'string' && m)
      }
    }
  } catch {
    // повреждённый резерв — используем дефолтный
  }
  return DEFAULT_FALLBACK_MODELS
}

/** Сохраняет резервные модели (вызывается после загрузки списка в настройках). */
export function storeFallbackModels(ids: string[]) {
  localStorage.setItem(FALLBACK_MODELS_STORAGE, JSON.stringify(ids.slice(0, 3)))
}

export async function loadExistingQuestionTexts(
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('questions')
    .select('text')
    .eq('user_id', userId)
  const set = new Set<string>()
  if (!error && data) {
    for (const row of data as { text: string }[]) {
      set.add(normalizeQuestionText(row.text))
    }
  }
  return set
}

/**
 * Общий цикл генерации (Шаги 6 и 8): порции по 10, фильтр дублей,
 * insert в Supabase, прогресс. buildMessages строит сообщения для
 * каждой порции; onProgress сообщает, сколько вопросов сохранено.
 */
export async function generateQuestionsBatch({
  apiKey,
  preferredModel,
  total,
  difficulties,
  userId,
  topic,
  source,
  buildMessages,
  onProgress,
}: {
  apiKey: string
  preferredModel: string
  total: number
  difficulties: string[]
  userId: string
  topic: string
  source: 'ai' | 'pdf'
  buildMessages: (portionCount: number, difficultyLabel: string) => ChatMessage[]
  onProgress: (savedTotal: number) => void
}): Promise<{ saved: number; error: string | null }> {
  const existingTexts = await loadExistingQuestionTexts(userId)
  let savedTotal = 0
  let lastError: string | null = null

  while (savedTotal < total) {
    const portionSize = Math.min(10, total - savedTotal)
    const difficulty =
      difficulties[Math.floor(Math.random() * difficulties.length)]
    const difficultyLabel =
      difficulty === 'easy'
        ? 'Лёгкий'
        : difficulty === 'hard'
          ? 'Сложный'
          : 'Средний'

    const result = await requestQuestionsFromAI({
      apiKey,
      preferredModel,
      messages: buildMessages(portionSize, difficultyLabel),
    })

    if (result.kind === 'error') {
      lastError = result.message
      break
    }

    const fresh = result.questions.filter((q) => {
      const normalized = normalizeQuestionText(q.text)
      if (existingTexts.has(normalized)) return false
      existingTexts.add(normalized)
      return true
    })

    if (fresh.length === 0) {
      // Модель вернула только дубли или невалидные вопросы —
      // заканчиваем, чтобы не запрашивать одну и ту же порцию вечно.
      break
    }

    const { error } = await supabase.from('questions').insert(
      fresh.map((q) => ({
        user_id: userId,
        text: q.text.trim(),
        option_a: q.options[0].trim(),
        option_b: q.options[1].trim(),
        option_c: q.options[2].trim(),
        option_d: q.options[3].trim(),
        correct_index: q.correct,
        difficulty:
          difficulties[Math.floor(Math.random() * difficulties.length)],
        tricky: false,
        topic: topic.trim() || null,
        source,
      })),
    )
    if (error) {
      lastError = 'Не удалось сохранить вопросы в базу'
      break
    }

    savedTotal += fresh.length
    onProgress(savedTotal)
  }

  return { saved: savedTotal, error: lastError }
}
