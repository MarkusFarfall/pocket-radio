-- ============================================================================
-- Pocket Radio — схема Supabase
-- Выполните целиком в Supabase → SQL Editor. Скрипт можно запускать повторно.
-- ============================================================================

-- 1. Профили (имя и цвет аватара; создаются автоматически при регистрации) ------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  hue          int  default 20,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2. Снимок данных пользователя (используется src/lib/sync.ts) ------------------
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. Row Level Security: каждый видит и меняет только свои строки ----------------
alter table public.profiles  enable row level security;
alter table public.user_data enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "user_data_all_own" on public.user_data;
create policy "user_data_all_own" on public.user_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Автосоздание профиля при регистрации ---------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, hue)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'hue')::int, 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Удаление собственного аккаунта (вызывается из приложения через RPC) --------
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================================
-- ЭТАП 2 (черновик): нормализованные таблицы вместо одного снимка.
-- Раскомментируйте и доработайте, когда будете переходить на инкрементальную синхронизацию.
-- ============================================================================
-- create table public.stations (
--   id          text not null,
--   user_id     uuid not null references auth.users (id) on delete cascade,
--   data        jsonb not null,               -- вся карточка станции
--   updated_at  timestamptz not null default now(),
--   deleted_at  timestamptz,                  -- «надгробие» для синхронизации удалений
--   primary key (user_id, id)
-- );
-- create table public.listening_sessions (
--   id          bigint generated always as identity primary key,
--   user_id     uuid not null references auth.users (id) on delete cascade,
--   station_id  text not null,
--   started_at  timestamptz not null,
--   seconds     int not null
-- );
-- alter table public.stations enable row level security;
-- alter table public.listening_sessions enable row level security;
-- create policy "stations_own" on public.stations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "sessions_own" on public.listening_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
