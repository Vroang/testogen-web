# PROGRESS — веб-версия

## Текущий шаг: 0 — скелет проекта
## Статус: шаг 0 выполнен

## Что сделано
- Проверено окружение. Установлены Node.js v24.21.0 LTS и Git 2.55.0
  (в пользовательскую папку, без прав администратора), добавлены в PATH.
- Создан проект Vite + React 18 + TypeScript.
- Установлены зависимости: react-router-dom, @supabase/supabase-js,
  tailwindcss (v3) + postcss + autoprefixer.
- Настроен Tailwind (content-пути, директивы в src/index.css).
- Созданы VISION.md, PLAN.md, PROGRESS.md.
- Создан Supabase-клиент: src/lib/supabase.ts.
- Сделан главный экран-заглушка «ТестоГен — веб-версия» с кнопкой «Войти»
  (светлый фон, teal-акцент, карточка со скруглениями ~16 px).
- Проверено: `npm run build` собирается без ошибок; dev-сервер работает
  на http://localhost:5173; экран отрисован, ошибок в консоли браузера нет.
- Проект отправлен в GitHub: https://github.com/Vroang/testogen-web (main).

## Известные проблемы
- Supabase отклоняет anon-ключ из задания: REST и Auth отвечают
  «Invalid API key» (HTTP 401). Проект Supabase при этом живой.
  Ключ в Android-приложении (SupabaseClient.kt) идентичен — вероятно,
  ключ перевыпущен в панели Supabase. Нужно взять актуальный anon-ключ
  из Supabase Dashboard → Project Settings → API Keys и обновить
  одну строку в src/lib/supabase.ts. На шаг 0 не влияет: заглушка
  ни к каким данным не обращается.

## Заметки
- Инструменты установлены в пользовательские папки:
  Node — %LOCALAPPDATA%\Programs\nodejs,
  Git (Portable) — %LOCALAPPDATA%\Programs\Git.
- Прокси для GitHub уже был настроен в %USERPROFILE%\.gitconfig
  (http://127.0.0.1:10808) — оставлен как есть.
- В системном конфиге PortableGit заменён credential-helper-selector
  на обычное хранилище (store): селектор показывал невидимый диалог
  и puши зависали. Токен GitHub перенесён из диспетчера учётных
  данных Windows в %USERPROFILE%\.git-credentials.
- Tailwind зафиксирован на v3: стабильная линия с tailwind.config.js
  и директивами @tailwind (v4 использует другой механизм настройки).
