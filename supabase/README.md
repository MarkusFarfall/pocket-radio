# Подключение Supabase к Pocket Radio

Production-проект: [pocket-radio](https://supabase.com/dashboard/project/zcohgsqefkygwvyzrico)
(`zcohgsqefkygwvyzrico`, Frankfurt). Схема (`profiles`, `user_data`, RLS, триггер, `delete_my_account`)
уже применена. Production сохраняет публичные Supabase defaults; `VITE_SUPABASE_*` их перекрывают.
Для безопасной локальной разработки `vite dev` использует локальный auth, если явно не задано
`VITE_AUTH_PROVIDER=supabase`. Значения из `.env.example` выбирают локальный auth.

## Шаги

1. Создайте проект на [supabase.com](https://supabase.com).
2. Откройте **SQL Editor** и выполните `supabase/schema.sql` (таблицы, политики доступа RLS, триггер профиля,
   функция `delete_my_account`).
3. **Project Settings → API**: скопируйте *Project URL* и *anon public key*.
4. В корне проекта задайте режим и, если подключаете собственный проект, скопируйте `.env.example`
   в `.env.local` и заполните значения:

   ```
   VITE_AUTH_PROVIDER=supabase
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   На Vercel задайте `VITE_AUTH_PROVIDER=supabase` и при необходимости те же `VITE_SUPABASE_*`
   в **Project Settings → Environment Variables** (Production и Preview). Переменные `VITE_*`
   вшиваются в клиент на этапе `vite build`. Если указана только одна из пары URL/key, Supabase
   считается не настроенным.
5. Пересоберите приложение (`npm run build`). Вход и регистрация пойдут через Supabase, логином станет email.
6. **Authentication → URL Configuration**: добавьте адрес, где опубликовано приложение (Site URL и Redirect URLs) —
   иначе ссылки из писем (подтверждение email, сброс пароля) будут вести не туда.
7. По желанию отключите подтверждение email: **Authentication → Providers → Email → Confirm email**.

## Как это устроено

| Файл | Назначение |
| --- | --- |
| `src/lib/auth/types.ts` | интерфейс `AuthProvider` — единый для всех бэкендов |
| `src/lib/auth/local.ts` | локальные аккаунты (IndexedDB, PBKDF2) |
| `src/lib/auth/supabase.ts` | Supabase Auth через REST (без SDK) |
| `src/lib/auth/index.ts` | выбор поставщика по переменным окружения |
| `src/lib/auth/AuthContext.tsx` | состояние входа в React, переключение баз данных |
| `src/lib/sync.ts` | отправка и загрузка снимка данных в таблицу `user_data` |

У каждого аккаунта своя база IndexedDB (`pocket-radio-u-<id>`), гостевая — `local-radio`.

## Облачный обмен и ограничения

Обмен запускается вручную кнопками «В облако» и «Из облака» в профиле. Сначала загрузите уже существующий облачный снимок; если он изменился после последнего обмена, приложение попросит снова выполнить загрузку перед отправкой. При загрузке станции сопоставляются по URL, история и события дедуплицируются, плейлисты объединяют треки, а прогресс выбирается по времени изменения.

Это ещё не полноценная синхронизация: удаления между устройствами и сами бинарные офлайн-файлы не переносятся; автоматического обмена и Realtime нет. Локальные треки могут появиться в метаданных плейлиста на другом устройстве, но аудиофайл нужно добавить туда отдельно.

## Что осталось доделать

- Проверить регистрацию, вход, сброс пароля и удаление на живом проекте — код написан по документации, но не запускался.
- Инкрементальная синхронизация по таблицам (черновик в конце `schema.sql`), автосинхронизация и Realtime.
- Вход через Google/Apple (OAuth) — добавляется в `supabase.ts` через `/auth/v1/authorize?provider=...`.
- Подключить SDK `@supabase/supabase-js`, если понадобится Realtime: интерфейс `AuthProvider` менять не придётся.
- Включить двухфакторную аутентификацию (Authentication → MFA) и CAPTCHA на форме регистрации.

## Безопасность

- В приложение попадает только **anon key** — он публичный по замыслу, защиту обеспечивают политики RLS.
  **Никогда** не кладите `service_role` ключ в `.env` с префиксом `VITE_`.
- Локальные аккаунты защищают вход в приложение, но не шифруют данные на диске. Для реальной защиты
  и доступа с нескольких устройств используйте Supabase.
