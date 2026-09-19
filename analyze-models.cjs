const fs = require('fs')
const path = require('path')
const raw = fs.readFileSync(path.join(process.env.TEMP, 'or_models_proxy.json'), 'utf8')
const d = JSON.parse(raw)
const models = d.data || []
console.log('total:', models.length)
const free = models.filter((m) => (m.id || '').endsWith(':free'))
console.log('free (":free") count:', free.length)
free.slice(0, 40).forEach((m) => console.log('  FREE:', m.id))
console.log('zero-priced non-suffix count:', models.filter((m) => !(m.id || '').endsWith(':free') && String(m.pricing?.prompt) === '0' && String(m.pricing?.completion) === '0').length)
console.log('llama-3.3:free present:', models.some((m) => m.id === 'meta-llama/llama-3.3-70b-instruct:free'))
console.log('llama-3.3 paid present:', models.some((m) => m.id === 'meta-llama/llama-3.3-70b-instruct'))
const candidates = [
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-72b-instruct:free',
]
console.log('candidates:')
candidates.forEach((c) => console.log('  ', c, '->', models.some((m) => m.id === c) ? 'EXISTS' : 'MISSING'))
