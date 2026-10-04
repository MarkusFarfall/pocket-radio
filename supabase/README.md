# Подключение Supabase к Pocket Radio

Живой проект: [pocket-radio](https://supabase.com/dashboard/project/zcohgsqefkygwvyzrico)
(`zcohgsqefkygwvyzrico`, Frankfurt). Схема (`profiles`, `user_data`, RLS, триггер, `delete_my_account`)
уже применена. Публичный anon key зашит в клиент как значение по умолчанию; `VITE_SUPABASE_*` его перекрывают.

## Шаги

1. Создайте проект на [supabase.com](https://supabase.com).
2. Откройте **SQL Editor** и выполните `supabase/schema.sql` (таблицы, политики доступа RLS, триггер профиля,
   функция `delete_my_account`).
3. **Project Settings → API**: скопируйте *Project URL* и *anon public key*.
4. В корне проекта скопируйте `.env.example` в `.env.local` и вставьте значения:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

   На Vercel те же имена задаются в **Project Settings → Environment Variables**
   (Production и Preview). Переменные `VITE_*` вшиваются в клиент на этапе `vite build`.
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
