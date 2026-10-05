# Pocket Radio

Интернет-радио в кармане: свои потоки, готовые подборки, поиск станций, подкасты,
плейлисты, статистика прослушивания и работа офлайн. PWA — ставится на телефон.

Исходники пришли из релиза [`Lider` / Pocket Radio](https://github.com/MarkusFarfall/apps/releases/tag/Lider)
(`pocket-radio-sonnet.zip`).

**Стек:** Vite 7 · React 19 · TypeScript 5.9 · Tailwind CSS 4 · Dexie (IndexedDB) ·
Supabase Auth (REST без SDK).

**Supabase:** production использует проект [`pocket-radio`](https://supabase.com/dashboard/project/zcohgsqefkygwvyzrico)
(`zcohgsqefkygwvyzrico`, Frankfurt). В локальном `vite dev` по умолчанию включён локальный auth;
для облачной проверки задайте `VITE_AUTH_PROVIDER=supabase`.

**Живая версия:** https://pocket-radio-iota.vercel.app

Прод: проект Vercel `pocket-radio`, **Root Directory** = `projects/pocket-radio`,
пуш в `main` деплоится автоматически.

## Что умеет

| Раздел | Содержимое |
|---|---|
| **Свои станции** | потоки HTTP / Icecast / SHOUTcast / HLS, LAN, локальные файлы |
| **Каталог** | поиск по Radio Browser, готовые паки и подборки |
| **Подкасты** | ленты RSS, эпизоды, офлайн-кэш |
| **Плейлисты** | свои списки, импорт M3U |
| **Плеер** | мини / полный / студия на десктопе, темы и внешний вид |
| **Статистика** | время эфира, история, топ станций |
| **Аккаунты** | локально (IndexedDB + PBKDF2) или облако через Supabase |
| **Синхронизация** | снимок данных в таблицу `user_data` (кнопки в Настройках) |

## Разработка

```bash
cd projects/pocket-radio
npm ci
cp .env.example .env.local   # рекомендуем: локальный auth по умолчанию
npm run dev                  # http://localhost:5173
npm run build                # прод-сборка в dist/
npm run typecheck
npx playwright install chromium  # один раз: браузер для UI-тестов
npm test                    # адаптивность, навигация, auth и плеер
```

Vite собирает код в отдельные файлы `dist/assets/`; HLS-плеер загружается отдельным
чанком только при необходимости, что уменьшает начальную загрузку на телефоне.
Service worker кеширует загруженные same-origin JS/CSS-ресурсы, манифест и иконку.

## Supabase

Локальный `vite dev` использует локальные аккаунты и не отправляет данные в облако.
Чтобы тестировать текущий production-проект, задайте `VITE_AUTH_PROVIDER=supabase`.
Для подключения собственного проекта укажите обе переменные ниже:

```
VITE_AUTH_PROVIDER=supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Локально — в `.env.local`. На Vercel — `VITE_AUTH_PROVIDER=supabase` и при необходимости `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` (Production + Preview). Это **публичный anon key**, его можно светить на клиенте;
защиту дают RLS. `service_role` в репозиторий и в `VITE_*` не класть.

Дальше:

1. В Supabase → SQL Editor выполнить `supabase/schema.sql` (таблицы `profiles` и
   `user_data`, RLS, триггер профиля, RPC `delete_my_account`). Скрипт идемпотентный.
2. **Authentication → URL Configuration:** Site URL и Redirect URLs — адрес
   опубликованного приложения, иначе письма подтверждения/сброса пароля ведут не туда.
3. По желанию отключить Confirm email: **Authentication → Providers → Email**.
4. Пересобрать. Вход и регистрация пойдут через Supabase, логином станет email.

Подробности и что ещё не доделано — в `supabase/README.md`.

## Устройство

```
src/
  main.tsx              точка входа, регистрация SW
  App.tsx               каркас: вкладки, плеер, модалки
  components/           плеер, станции, аккаунт, шаринг
  desktop/              студийный интерфейс для широкого экрана
  views/                Home, Catalog, Playlists, Discover, Stats, Settings
  lib/
    player.ts           движок воспроизведения (в т.ч. HLS)
    db.ts               IndexedDB через Dexie
    auth/               local | supabase, переключатель по env
    sync.ts             снимок профиля в public.user_data
    radiobrowser.ts     поиск станций
    offline.ts          офлайн-кэш аудио
public/
  manifest.webmanifest
  sw.js
  icon-512.jpg
supabase/
  schema.sql            таблицы, RLS, триггер, RPC
  README.md
```

У каждого аккаунта своя база IndexedDB (`pocket-radio-u-<id>`), гостевая — `local-radio`.
В dev-режиме Supabase не вызывается без явного `VITE_AUTH_PROVIDER=supabase`.
Production сохраняет подключение к стандартному Pocket Radio Supabase; установите
`VITE_AUTH_PROVIDER=local`, чтобы отключить облачный auth.
