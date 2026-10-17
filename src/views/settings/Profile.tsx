import { Cloud, LogOut } from "lucide-react";
import { Avatar } from "../../components/AccountUI";
import { btnGhost, btnPrimary } from "../../components/ui";
import { useAuth } from "../../lib/auth/AuthContext";
import { Group, Row } from "./parts";
import { CloudSync } from "./CloudSync";

export function Profile({ onAccount }: { onAccount: () => void }) {
  const auth = useAuth();
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
          <CloudSync user={auth.user} />
        )}
      </Group>
    </>
  );
}
