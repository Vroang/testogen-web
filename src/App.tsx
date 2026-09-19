function App() {
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
        <button
          type="button"
          onClick={() => {}}
          className="mt-8 w-full cursor-pointer rounded-2xl bg-teal-600 px-8 py-3 text-lg font-medium text-white transition-colors hover:bg-teal-700"
        >
          Войти
        </button>
      </div>
    </div>
  )
}

export default App
