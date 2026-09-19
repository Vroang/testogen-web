import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { plural } from '../lib/plural'
import AppHeader from '../components/AppHeader'
import {
  MAX_FILE_SIZE,
  SUPPORTED_EXTENSIONS,
  processTextbookFile,
} from '../lib/textbookParser'
import type { ParsedParagraph } from '../lib/textbookParser'

type Textbook = {
  id: string
  name: string
  format: string
  paragraph_count: number
  storage_path: string
  uploaded_at: string
}

type LoadState = 'loading' | 'error' | 'done'

type Processing = {
  fileName: string
  percent: number
  stage: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function TextbooksPage({ session }: { session: Session }) {
  const navigate = useNavigate()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)
  const [processing, setProcessing] = useState<Processing | null>(null)
  const [sizeDialog, setSizeDialog] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Textbook | null>(null)
  const [deletingInProgress, setDeletingInProgress] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  function showToast(text: string, kind: 'ok' | 'error' = 'ok') {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ text, kind, key: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  function load() {
    setLoadState('loading')
    supabase
      .from('textbooks')
      .select('*')
      .eq('user_id', session.user.id)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(`Не удалось загрузить учебники: ${error.message}`)
          setLoadState('error')
          return
        }
        setTextbooks((data ?? []) as Textbook[])
        setLoadState('done')
      })
  }

  useEffect(() => {
    load()
    // Загрузка выполняется один раз при открытии экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id])

  function handlePickFile() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void handleUpload(file)
  }

  async function rollbackUpload(storagePath: string, textbookId: string) {
    await supabase.storage.from('textbooks').remove([storagePath])
    await supabase.from('textbooks').delete().eq('id', textbookId)
  }

  async function handleUpload(file: File) {
    if (processing) return

    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      showToast('Неподдерживаемый формат', 'error')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setSizeDialog(Math.round((file.size / (1024 * 1024)) * 10) / 10)
      return
    }

    setProcessing({ fileName: file.name, percent: 5, stage: 'Чтение файла' })

    let paragraphs: ParsedParagraph[]
    try {
      const result = await processTextbookFile(file, (percent, stage) => {
        setProcessing({ fileName: file.name, percent, stage })
      })
      paragraphs = result.paragraphs
    } catch (e) {
      setProcessing(null)
      const message =
        e instanceof Error ? e.message : 'Не удалось обработать файл'
      console.error(`Ошибка обработки файла: ${message}`)
      showToast(message, 'error')
      return
    }

    try {
      setProcessing((prev) =>
        prev ? { ...prev, percent: 75, stage: 'Загрузка в облако' } : prev,
      )
      const textbookId = crypto.randomUUID()
      const storagePath = `${session.user.id}/${textbookId}.${ext}`
      const name = file.name.replace(/\.[^.]+$/, '')

      const { error: storageError } = await supabase.storage
        .from('textbooks')
        .upload(storagePath, file, { upsert: true })
      if (storageError) throw new Error(storageError.message)

      setProcessing((prev) =>
        prev ? { ...prev, percent: 85, stage: 'Загрузка в облако' } : prev,
      )
      const { error: textbookError } = await supabase
        .from('textbooks')
        .insert({
          id: textbookId,
          name,
          format: ext,
          paragraph_count: paragraphs.length,
          storage_path: storagePath,
          user_id: session.user.id,
        })
      if (textbookError) throw new Error(textbookError.message)

      setProcessing((prev) =>
        prev ? { ...prev, percent: 90, stage: 'Загрузка в облако' } : prev,
      )
      for (let i = 0; i < paragraphs.length; i += 100) {
        const chunk: ParsedParagraph[] = paragraphs
          .slice(i, i + 100)
          .map((p) => ({
            textbook_id: textbookId,
            number: p.number,
            title: p.title,
            text: p.text,
            start_page: p.start_page,
            end_page: p.end_page,
          }))
        const { error: paragraphError } = await supabase
          .from('paragraphs')
          .insert(chunk)
        if (paragraphError) {
          // откат: удаляем файл и запись учебника
          await rollbackUpload(storagePath, textbookId)
          throw new Error(paragraphError.message)
        }
      }

      setProcessing((prev) =>
        prev ? { ...prev, percent: 100, stage: 'Загрузка в облако' } : prev,
      )
      setProcessing(null)
      showToast(`Учебник загружен: ${paragraphs.length} ${plural(paragraphs.length, 'параграф', 'параграфа', 'параграфов')}`)
      load()
    } catch (e) {
      setProcessing(null)
      const message =
        e instanceof Error ? e.message : 'Не удалось загрузить учебник'
      console.error(`Ошибка загрузки учебника: ${message}`)
      showToast(`Не удалось загрузить учебник: ${message}`, 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting || deletingInProgress) return
    setDeletingInProgress(true)
    const target = deleting

    const { error: paragraphError } = await supabase
      .from('paragraphs')
      .delete()
      .eq('textbook_id', target.id)
    if (paragraphError) {
      setDeletingInProgress(false)
      setDeleting(null)
      showToast(
        `Не удалось удалить параграфы: ${paragraphError.message}`,
        'error',
      )
      return
    }

    const { error: textbookError } = await supabase
      .from('textbooks')
      .delete()
      .eq('id', target.id)
    if (textbookError) {
      setDeletingInProgress(false)
      setDeleting(null)
      showToast(
        `Не удалось удалить учебник: ${textbookError.message}`,
        'error',
      )
      return
    }

    await supabase.storage.from('textbooks').remove([target.storage_path])

    setDeletingInProgress(false)
    setDeleting(null)
    setTextbooks((prev) => prev.filter((t) => t.id !== target.id))
    showToast('Учебник удалён')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <AppHeader title="Мои учебники" email={session.user.email ?? ''} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <Link
            to="/home"
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← На главную
          </Link>
          {loadState === 'done' && !processing && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">
                Всего: {textbooks.length}{' '}
                {plural(textbooks.length, 'учебник', 'учебника', 'учебников')}
              </span>
              <button
                type="button"
                onClick={handlePickFile}
                className="cursor-pointer rounded-xl bg-[#0E7C6B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
              >
                + Загрузить учебник
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleFileChange}
        />

        {loadState === 'loading' && (
          <p className="pt-10 text-center text-slate-500">
            Загружаем учебники…
          </p>
        )}

        {loadState === 'error' && (
          <div className="pt-10 text-center">
            <p className="text-red-600">
              Не удалось загрузить учебники. Проверьте соединение.
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

        {loadState === 'done' && textbooks.length === 0 && !processing && (
          <p className="pt-10 text-center text-slate-500">
            Пока нет учебников. Нажмите +, чтобы загрузить первый.
          </p>
        )}

        {processing && (
          <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
            <p className="font-medium text-slate-800">
              Обрабатываем файл «{processing.fileName}»…
            </p>
            <p className="mt-1 text-sm text-slate-500">{processing.stage}</p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#0E7C6B] transition-all duration-300"
                style={{ width: `${processing.percent}%` }}
              />
            </div>
            <p className="mt-2 text-right text-sm text-slate-400">
              {processing.percent}%
            </p>
          </div>
        )}

        {loadState === 'done' && (
          <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
            {textbooks.map((t) => (
              <div
                key={t.id}
                onClick={() => navigate(`/textbooks/${t.id}`)}
                className="cursor-pointer rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {t.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {t.format.toUpperCase()} ·{' '}
                      {t.paragraph_count}{' '}
                      {plural(
                        t.paragraph_count,
                        'параграф',
                        'параграфа',
                        'параграфов',
                      )}{' '}
                      · загружен {formatDate(t.uploaded_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Удалить учебник"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting(t)
                    }}
                    className="shrink-0 cursor-pointer rounded-xl p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {sizeDialog !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-800">
              Файл слишком большой ({sizeDialog} МБ)
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Максимум — 50 МБ. Попробуйте сжать PDF или использовать другой
              файл.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSizeDialog(null)}
                className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

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
              Удалить учебник?
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Все параграфы и файл будут удалены. Отменить нельзя.
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
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-sm text-white shadow-lg ${
            toast.kind === 'error' ? 'bg-red-600' : 'bg-slate-800'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

export default TextbooksPage
