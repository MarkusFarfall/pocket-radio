import { useState } from "react";
import { Check, CloudDownload, CloudUpload, Copy, Loader2, RefreshCw, ServerCog } from "lucide-react";
import type { AuthUser } from "../../lib/auth/types";
import { checkCloudReadiness, getSyncState, lastSyncAt, pullFromCloud, pushToCloud, setAutoSync, syncNow, useSyncState } from "../../lib/sync";
import { toast } from "../../lib/toast";
import { Toggle, btnGhost, btnPrimary } from "../../components/ui";
import { Row } from "./parts";

/**
 * SQL, которого не хватает уже работающему проекту. Держим его рядом с интерфейсом,
 * чтобы подготовка сервера занимала один Copy → Run. Полная версия — supabase/schema.sql.
 */
const SYNC_SQL = `-- Pocket Radio: синхронизация аккаунта
create table if not exists public.sync_docs (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists sync_docs_updated_idx on public.sync_docs (user_id, updated_at);

create or replace function public.sync_docs_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists sync_docs_touch on public.sync_docs;
create trigger sync_docs_touch before insert or update on public.sync_docs
for each row execute function public.sync_docs_touch();

alter table public.sync_docs enable row level security;
drop policy if exists "sync_docs_all_own" on public.sync_docs;
create policy "sync_docs_all_own" on public.sync_docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

const time = (ms: number) =>
  new Date(ms).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function statusLine(s: ReturnType<typeof useSyncState>, legacyAt: number | null): { text: string; tone: "muted" | "ok" | "bad" } {
  if (s.phase === "setup" || s.readiness?.docs === false) return { text: "Сервер ещё не подготовлен — нужен один SQL-запрос", tone: "bad" };
  if (s.phase === "error") return { text: s.error ?? "Не удалось синхронизировать", tone: "bad" };
  if (s.phase === "syncing") {
    const bits: string[] = [];
    if (s.pulled) bits.push(`получено ${s.pulled}`);
    if (s.pushed) bits.push(`отправлено ${s.pushed}`);
    return { text: bits.length ? `Обмен данными: ${bits.join(", ")}` : "Проверяем изменения…", tone: "muted" };
  }
  if (s.lastSyncAt) return { text: `Последняя синхронизация ${time(s.lastSyncAt)}`, tone: "ok" };
  if (legacyAt) return { text: `Старая копия: ${time(legacyAt)}`, tone: "muted" };
  return { text: "Готово к первому обмену", tone: "muted" };
}

export function CloudSync({ user }: { user: AuthUser }) {
  const s = useSyncState();
  const [busy, setBusy] = useState<"now" | "check" | "push" | "pull" | null>(null);
  const setup = s.readiness ? !s.readiness.docs : s.phase === "setup";
  const status = statusLine(s, lastSyncAt(user.id));

  const run = async (kind: "now" | "check") => {
    setBusy(kind);
    try {
      if (kind === "check") {
        const ready = await checkCloudReadiness();
        toast(ready.docs ? "Сервер готов" : "Нужно выполнить SQL из supabase/schema.sql", ready.docs ? "ok" : "error");
        if (ready.docs) await syncNow();
      } else {
        await syncNow();
        const current = getSyncState();
        if (current.phase === "setup") toast(current.error ?? "Сначала выполните SQL из supabase/schema.sql", "error");
        else if (current.phase === "error" && current.error) toast(current.error, "error");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Синхронизация не удалась", "error");
    } finally {
      setBusy(null);
    }
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SYNC_SQL);
      toast("SQL скопирован — вставьте в Supabase → SQL Editor → Run", "ok");
    } catch {
      toast("Не удалось скопировать — откройте supabase/schema.sql", "error");
    }
  };

  return (
    <>
      <Row
        title="Полная синхронизация"
        desc={
          <>
            Станции, плейлисты с вашими обложками, прогресс, история и оформление — на любом устройстве после входа.
            Изменения уходят сами. <span className={status.tone === "bad" ? "text-bad" : status.tone === "ok" ? "text-ok" : undefined}>{status.text}</span>
          </>
        }
        stack
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          Отправлять изменения автоматически
          <Toggle checked={s.auto} onChange={setAutoSync} label="Автоматическая синхронизация" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy !== null || !s.active} onClick={() => void run("now")}>
            {busy === "now" || s.phase === "syncing" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Синхронизировать сейчас
          </button>
          <button className={btnGhost} disabled={busy !== null} onClick={() => void run("check")}>
            {busy === "check" ? <Loader2 size={16} className="animate-spin" /> : <ServerCog size={16} />} Проверить сервер
          </button>
        </div>
      </Row>

      <Row
        title="Скачанная музыка"
        desc="Скачанные файлы остаются на своём устройстве: в облако уходят только плейлисты, обложки и прогресс. На другом компьютере плейлист появится сразу, а музыку нужно скачать заново."
      >
        <CloudDownload size={22} className="shrink-0 text-muted" />
      </Row>

      {setup && (
        <Row
          title="Подготовить сервер"
          desc={
            <>
              В вашем Supabase-проекте нужна таблица <code className="font-mono">sync_docs</code>. Выполните SQL ниже один
              раз: Supabase → SQL Editor → Run. После этого нажмите «Проверить сервер».
            </>
          }
          stack
        >
          <textarea readOnly value={SYNC_SQL} className="h-28 w-full resize-y rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted" aria-label="SQL для синхронизации" />
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => void copySql()}>
              <Copy size={16} /> Скопировать SQL
            </button>
            <button className={btnGhost} disabled={busy !== null} onClick={() => void run("check")}>
              {busy === "check" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Проверить сервер
            </button>
          </div>
        </Row>
      )}

      {s.readiness && !s.readiness.docs && (
        <Row
          title="Резервная копия (старый способ)"
          desc="Пока таблица sync_docs не создана, можно вручную отправить и загрузить общий снимок данных. Аудио и удаления в него не входят."
          stack
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              className={btnGhost}
              disabled={busy !== null}
              onClick={async () => {
                setBusy("push");
                try {
                  await pushToCloud();
                  toast("Снимок отправлен", "ok");
                } catch (error) {
                  toast(error instanceof Error ? error.message : "Не удалось отправить", "error");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "push" ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />} В облако
            </button>
            <button
              className={btnGhost}
              disabled={busy !== null}
              onClick={async () => {
                setBusy("pull");
                try {
                  const result = await pullFromCloud();
                  toast(result ? `Загружено: станций ${result.added}, сессий ${result.sessions}, плейлистов ${result.playlists}` : "В облаке пока нет данных", result ? "ok" : "info");
                } catch (error) {
                  toast(error instanceof Error ? error.message : "Не удалось загрузить", "error");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "pull" ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />} Из облака
            </button>
          </div>
        </Row>
      )}
    </>
  );
}
