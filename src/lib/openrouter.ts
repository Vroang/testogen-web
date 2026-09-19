export const OPENROUTER_MODELS = [
  { id: 'openrouter/auto', label: 'Auto — сама выберет модель' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat v3.1' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (бесплатная)' },
]

export const OPENROUTER_KEY_STORAGE = 'openrouter_api_key'
export const OPENROUTER_MODEL_STORAGE = 'openrouter_model'

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

const SYSTEM_PROMPT = `Ты — генератор школьных тестов по истории и обществознанию. Твоя задача — составить вопросы с вариантами ответов.

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

function buildUserPrompt(topic: string, count: number, difficultyLabel: string): string {
  return `Тема: ${topic}
Количество вопросов: ${count}
Сложность: ${difficultyLabel}

Верни JSON-массив вопросов.`
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

export async function generatePortion({
  apiKey,
  preferredModel,
  topic,
  count,
  difficulties,
}: {
  apiKey: string
  preferredModel: string
  topic: string
  count: number
  difficulties: string[]
}): Promise<PortionResult> {
  const modelOrder = [
    preferredModel,
    ...OPENROUTER_MODELS.map((m) => m.id).filter(
      (modelId) => modelId !== preferredModel,
    ),
  ]
  let lastError = 'Не удалось связаться с OpenRouter'

  for (const model of modelOrder) {
    try {
      const difficulty =
        difficulties[Math.floor(Math.random() * difficulties.length)]
      const difficultyLabel =
        difficulty === 'easy'
          ? 'Лёгкий'
          : difficulty === 'hard'
            ? 'Сложный'
            : 'Средний'

      const res = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: buildUserPrompt(topic, count, difficultyLabel),
              },
            ],
          }),
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

  return { kind: 'error', message: lastError }
}
