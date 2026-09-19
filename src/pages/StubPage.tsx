import { Link } from 'react-router-dom'

function StubPage({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAFAF7] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0E7C6B] text-3xl text-white">
          {icon}
        </div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-3 text-slate-500">Скоро</p>
        <p className="mt-2 text-sm text-slate-400">
          Этот раздел появится в следующих шагах
        </p>
        <Link
          to="/home"
          className="mt-8 inline-block cursor-pointer rounded-2xl bg-[#0E7C6B] px-8 py-3 font-medium text-white transition-colors hover:bg-[#0B6355]"
        >
          ← На главную
        </Link>
      </div>
    </div>
  )
}

export default StubPage
