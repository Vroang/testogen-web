import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function AppHeader({ title, email }: { title: string; email: string }) {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0E7C6B] text-xl text-white">
            Т
          </div>
          <span className="text-xl font-bold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline" title={email}>
            {email.split('@')[0]}
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
  )
}

export default AppHeader
