import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { plural } from '../lib/plural'

type Textbook = {
  id: string
  name: string
  format: string
  paragraph_count: number
  storage_path: string
  uploaded_at: string
}

type Paragraph = {
  id: string
  number: number
  title: string | null
  text: string
  start_page: number
  end_page: number
}

type LoadState = 'loading' | 'error' | 'notfound' | 'ready'

function TextbookViewPage({ session }: { session: Session }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [textbook, setTextbook] = useState<Textbook | null>(null)
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error'; key: number } | null>(null)
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

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    Promise.all([
      supabase
        .from('textbooks')
        .select('*')
        .eq('id', id!)
        .eq('user_id', session.user.id)
        .maybeSingle(),
      supabase
        .from('paragraphs')
        .select('*')
        .eq('textbook_id', id!)
        .order('number', { ascending: true }),
    ]).then(([textbookResult, paragraphResult]) => {
      if (cancelled) return
      if (textbookResult.error || paragraphResult.error) {
        const message =
          textbookResult.error?.message ?? paragraphResult.error?.message ?? ''
        console.error(`Не удалось загрузить учебник: ${message}`)
        setLoadState('error')
        return
      }
      if (!textbookResult.data) {
        setLoadState('notfound')
        return
      }
      setTextbook(textbookResult.data as Textbook)
      setParagraphs((paragraphResult.data ?? []) as Paragraph[])
      setLoadState('ready')
    })
    return () => {
      cancelled = true
    }
    // Загрузка выполняется при открытии экрана (и при смене id в URL).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session.user.id])

  async function handleDelete() {
    if (!textbook || deleteInProgress) return
    setDeleteInProgress(true)

    const { error: paragraphError } = await supabase
      .from('paragraphs')
      .delete()
      .eq('textbook_id', textbook.id)
    if (paragraphError) {
      setDeleteInProgress(false)
      showToast(
        `Не удалось удалить параграфы: ${paragraphError.message}`,
        'error',
      )
      return
    }

    const { error: textbookError } = await supabase
      .from('textbooks')
      .delete()
      .eq('id', textbook.id)
    if (textbookError) {
      setDeleteInProgress(false)
      showToast(
        `Не удалось удалить учебник: ${textbookError.message}`,
        'error',
      )
      return
    }

    await supabase.storage.from('textbooks').remove([textbook.storage_path])

    setDeleteInProgress(false)
    showToast('Учебник удалён')
    setTimeout(() => navigate('/textbooks'), 600)
  }

  function toggleExpanded(pid: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  const uploadedDate = textbook
    ? new Date(textbook.uploaded_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : ''

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF7]">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/textbooks"
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-[#0E7C6B] hover:text-[#0E7C6B]"
          >
            ← Мои учебники
          </Link>
          <span className="truncate text-xl font-bold text-slate-800">
            {textbook?.name ?? 'Учебник'}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-10 sm:px-6">
        {loadState === 'loading' && (
          <p className="pt-10 text-center text-slate-500">
            Загружаем учебник…
          </p>
        )}

        {loadState === 'error' && (
          <p className="pt-10 text-center text-red-600">
            Не удалось загрузить учебник. Проверьте соединение.
          </p>
        )}

        {loadState === 'notfound' && (
          <div className="pt-10 text-center">
            <p className="text-slate-500">Учебник не найден.</p>
            <Link
              to="/textbooks"
              className="mt-4 inline-block cursor-pointer rounded-2xl bg-[#0E7C6B] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
            >
              ← Мои учебники
            </Link>
          </div>
        )}

        {loadState === 'ready' && textbook && (
          <>
            <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">
                    {textbook.format.toUpperCase()} ·{' '}
                    {textbook.paragraph_count}{' '}
                    {plural(
                      textbook.paragraph_count,
                      'параграф',
                      'параграфа',
                      'параграфов',
                    )}{' '}
                    · загружен {uploadedDate}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/textbooks/${textbook.id}/generate`)}
                    className="cursor-pointer rounded-2xl bg-[#0E7C6B] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0B6355]"
                  >
                    ✨ Сгенерировать вопросы
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(true)}
                    className="cursor-pointer rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Удалить учебник
                  </button>
                </div>
              </div>
            </div>

            {paragraphs.length === 0 ? (
              <p className="pt-10 text-center text-slate-500">
                В этом учебнике нет параграфов.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {paragraphs.map((p) => {
                  const expanded = expandedIds.has(p.id)
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleExpanded(p.id)}
                      className="cursor-pointer rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <p className="font-medium text-slate-800">
                        § {p.number}
                        {p.title ? `. ${p.title}` : ''}
                      </p>
                      {textbook.format === 'pdf' && (
                        <p className="mt-1 text-sm text-slate-400">
                          стр. {p.start_page}–{p.end_page}
                        </p>
                      )}
                      {!expanded && (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                          {p.text.slice(0, 100)}
                        </p>
                      )}
                      {expanded && (
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                          {p.text}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDeleting(false)}
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
                onClick={() => setDeleting(false)}
                className="cursor-pointer rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteInProgress}
                className="cursor-pointer rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteInProgress ? 'Удаляем…' : 'Удалить'}
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

export default TextbookViewPage
