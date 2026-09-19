import type { Session } from '@supabase/supabase-js'

function HomePage({ session }: { session: Session }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 text-3xl text-white">
          Т
        </div>
        <h1 className="text-2xl font-bold text-slate-800">
          ТестоГен — веб-версия
        </h1>
        <p className="mt-3 text-slate-500">
          Работает с теми же данными, что и мобильное приложение
        </p>
        {session.user.email && (
          <p className="mt-4 text-sm text-slate-400">
            Вы вошли как {session.user.email}
          </p>
        )}
        <p className="mt-6 rounded-2xl bg-teal-50 px-5 py-3 text-sm text-teal-700">
          Здесь появятся банк вопросов, учебники и сборка тестов
        </p>
      </div>
    </div>
  )
}

export default HomePage
