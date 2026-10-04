import { useState } from "react";
import { Cloud, CloudDownload, CloudUpload, Loader2, LogOut } from "lucide-react";
import { Avatar } from "../../components/AccountUI";
import { btnGhost, btnPrimary } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthContext";
import { lastSyncAt, pullFromCloud, pushToCloud } from "../../lib/sync";
import { toast } from "../../lib/toast";
import { Group, Row } from "./parts";

export function Profile({ online, onAccount }: { online: boolean; onAccount: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(() => lastSyncAt());
  const code = (t: string) => <code className="font-mono">{t}</code>;

  return (
    <>
      <Group title="Аккаунт">
        {auth.user ? (
          <>
            <div className="flex items-center gap-4 p-4">
              <Avatar user={auth.user} size={52} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{auth.user.displayName}</div>
                <div className="truncate text-xs text-muted">
                  {auth.user.login} · {auth.provider.id === "supabase" ? "облачный аккаунт" : "локальный аккаунт"}
                </div>
              </div>
              <button className={btnGhost} onClick={onAccount}>
                Управление
              </button>
            </div>
            <Row title="Выйти из аккаунта" desc="Ваши данные останутся в профиле — войдите снова, чтобы вернуться к ним.">
              <button className={btnGhost} onClick={() => void auth.signOut()}>
                <LogOut size={16} /> Выйти
              </button>
            </Row>
          </>
        ) : (
          <Row title="Гостевой режим" desc="Данные хранятся без аккаунта. Войдите или создайте аккаунт — станции, избранное и статистика сохранятся в личном профиле, текущие данные можно перенести.">
            <button className={btnPrimary} onClick={auth.openAuth}>
              Войти
            </button>
          </Row>
        )}
      </Group>

      <Group title="Облако">
        {!auth.provider.capabilities.cloudSync ? (
          <Row title="Синхронизация между устройствами" desc={<>Не подключена: данные хранятся локально в браузере. Чтобы включить облако, задайте {code("VITE_SUPABASE_URL")} и {code("VITE_SUPABASE_ANON_KEY")} в файле {code(".env")} — инструкция в {code("supabase/README.md")}.</>}>
            <Cloud size={22} className="shrink-0 text-muted" />
          </Row>
        ) : !auth.user ? (
          <Row title="Синхронизация" desc="Войдите в облачный аккаунт, чтобы переносить данные между устройствами.">
            <Cloud size={22} className="shrink-0 text-muted" />
          </Row>
        ) : (
          <Row
            title="Синхронизация с Supabase"
            desc={syncedAt ? `Последний обмен: ${new Date(syncedAt).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Данные ещё не отправлялись. Загрузка из облака добавляет станции к вашим, ничего не стирая."}
            stack
          >
            <div className="grid grid-cols-2 gap-2">
              <button
                className={btnGhost}
                disabled={!online || busy !== null}
                onClick={async () => {
                  setBusy("push");
                  try {
                    await pushToCloud();
                    setSyncedAt(lastSyncAt());
                    toast("Данные отправлены в облако", "ok");
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Не удалось отправить", "error");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "push" ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />} В облако
              </button>
              <button
                className={btnGhost}
                disabled={!online || busy !== null}
                onClick={async () => {
                  setBusy("pull");
                  try {
                    const r = await pullFromCloud();
                    setSyncedAt(lastSyncAt());
                    toast(r ? `Загружено: станций ${r.added}` : "В облаке пока нет данных", r ? "ok" : "info");
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Не удалось загрузить", "error");
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
      </Group>
    </>
  );
}
