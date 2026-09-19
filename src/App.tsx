import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import QuestionsPage from './pages/QuestionsPage'
import EditQuestionPage from './pages/EditQuestionPage'
import NewQuestionPage from './pages/NewQuestionPage'
import GeneratePage from './pages/GeneratePage'
import SettingsPage from './pages/SettingsPage'
import TextbooksPage from './pages/TextbooksPage'
import TextbookViewPage from './pages/TextbookViewPage'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAF7] text-slate-500">
        Загрузка…
      </div>
    )
  }

  const authed = (element: React.ReactElement) =>
    session ? element : <Navigate to="/login" replace />

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={session ? <Navigate to="/home" replace /> : <LoginPage />}
        />
        <Route path="/home" element={authed(<HomePage session={session!} />)} />
        <Route
          path="/questions"
          element={authed(<QuestionsPage session={session!} />)}
        />
        <Route
          path="/questions/new"
          element={authed(<NewQuestionPage session={session!} />)}
        />
        <Route
          path="/questions/generate"
          element={authed(<GeneratePage session={session!} />)}
        />
        <Route
          path="/questions/:id/edit"
          element={authed(<EditQuestionPage session={session!} />)}
        />
        <Route
          path="/textbooks"
          element={authed(<TextbooksPage session={session!} />)}
        />
        <Route
          path="/textbooks/:id"
          element={authed(<TextbookViewPage session={session!} />)}
        />
        <Route
          path="/settings"
          element={authed(<SettingsPage />)}
        />
        <Route
          path="*"
          element={<Navigate to={session ? '/home' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
