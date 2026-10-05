import { useEffect, useMemo, useState } from "react";
import { Globe2, Link2, Loader2, Music2, Search as SearchIcon, Star, WifiOff, X } from "lucide-react";
import type { Draft } from "../../lib/types";
import type { ViewProps } from "../shared";
import { draftToStation } from "../../lib/db";
import { fetchPlaylist, loadPlaylistIndex, type PlaylistInfo } from "../../lib/sources";
import { userRegion } from "../../lib/radiobrowser";
import { cn } from "../../utils/cn";
import { btnGhost, btnPrimary, inputCls } from "../../components/ui";
import { ListModal } from "../../components/ListModal";
import { toast } from "../../lib/toast";

type Kind = "country" | "genre" | "top";

const GENRE_RU: Record<string, string> = {
  jazz: "Джаз",
  rock: "Рок",
  pop: "Поп",
  classical: "Классика",
  electronic: "Электроника",
  "hip hop": "Хип-хоп",
  "hip-hop": "Хип-хоп",
  news: "Новости",
  talk: "Разговорное",
  country: "Кантри",
  metal: "Метал",
  blues: "Блюз",
  reggae: "Регги",
  ambient: "Ambient",
  chillout: "Чилаут",
  lounge: "Лаунж",
  oldies: "Олдис",
  dance: "Танцевальная",
  folk: "Фолк",
  latin: "Latino",
  indie: "Инди",
  "lo-fi": "Lo-Fi",
  christian: "Христианская",
  kids: "Детям",
  sports: "Спорт",
  top: "Топ",
};

function title(p: PlaylistInfo) {
  if (p.type === "genre") {
    const key = p.name.toLowerCase().replace(/ radio stations$/, "").trim();
    return GENRE_RU[key] ? `${GENRE_RU[key]}` : p.name.replace(/ radio stations$/i, "");
  }
  return p.name;
}

export function Playlists({ have, online, onPlay }: { have: Set<string>; online: boolean; onPlay: ViewProps["onPlay"] }) {
  const [index, setIndex] = useState<PlaylistInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("country");
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState<{ name: string; url: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [plLoading, setPlLoading] = useState(false);
  const [plError, setPlError] = useState<string | null>(null);
  const region = useMemo(() => userRegion().toLowerCase(), []);

  useEffect(() => {
    if (!online) return;
    const c = new AbortController();
    setLoading(true);
    setError(null);
    loadPlaylistIndex(c.signal)
      .then((r) => !c.signal.aborted && setIndex(r))
      .catch((e) => !c.signal.aborted && setError(e instanceof Error ? e.message : "Не удалось загрузить"))
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, [online]);

  const openList = (name: string, u: string) => {
    setOpen({ name, url: u });
    setDrafts([]);
    setPlError(null);
    setPlLoading(true);
    fetchPlaylist(u)
      .then((r) => {
        setDrafts(r);
        if (!r.length) setPlError("В плейлисте не нашлось станций.");
      })
      .catch((e) => setPlError(e instanceof Error && /fetch|network/i.test(e.message) ? "Не удалось загрузить: сервер не разрешает запросы с других сайтов." : e instanceof Error ? e.message : "Не удалось загрузить"))
      .finally(() => setPlLoading(false));
  };

  const stations = useMemo(
    () =>
      drafts.map((d, i) => draftToStation({ ...d, id: `pl-${(open?.url ?? "").length.toString(36)}-${i}-${(d.url ?? "").slice(-14).replace(/\W/g, "")}` })),
    [drafts, open]
  );

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return index
      .filter((p) => p.type === kind && (!n || title(p).toLowerCase().includes(n) || p.name.toLowerCase().includes(n)))
      .sort((a, b) => {
        if (kind === "country") {
          if (a.id === region) return -1;
          if (b.id === region) return 1;
          return a.name.localeCompare(b.name, "ru");
        }
        return b.count - a.count;
      });
  }, [index, kind, q, region]);

  if (!online)
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <WifiOff size={32} className="mx-auto text-muted" />
        <p className="mt-3 font-display text-lg font-semibold">Плейлисты недоступны без сети</p>
      </div>
    );

  const tabs: [Kind, string, typeof Globe2][] = [
    ["country", "Страны", Globe2],
    ["genre", "Жанры", Music2],
    ["top", "Топ мира", Star],
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs leading-relaxed text-muted">
          Готовые M3U-плейлисты из открытого репозитория{" "}
          <a className="font-semibold text-accent underline underline-offset-2" href="https://github.com/AlonDrilich/radio-playlists" target="_blank" rel="noreferrer">
            radio-playlists
          </a>{" "}
          — станции из Radio Browser, у которых последняя проверка прошла успешно, обновляются раз в неделю. Откройте плейлист, послушайте, проверьте и добавьте нужное.
        </p>
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={cn(inputCls, "cursor-pointer sm:hidden")} aria-label="Тип плейлистов">
            {tabs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="hidden gap-1 rounded-xl bg-surface-2 p-1 sm:flex">
            {tabs.map(([id, label, I]) => (
              <button key={id} onClick={() => setKind(id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition", kind === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
                <I size={15} /> {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0">
            <SearchIcon size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input data-search className={cn(inputCls, "!py-2 pl-10")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "country" ? "Найти страну" : "Найти жанр"} />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink" aria-label="Очистить">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-bad/10 p-4 text-sm text-bad">Не удалось загрузить список плейлистов: {error}</div>}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Loader2 size={18} className="animate-spin" /> Загружаем список…
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((p) => (
          <button key={p.type + p.id} onClick={() => openList(title(p), p.url)} className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition hover:border-ink/30">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-mono text-[13px] font-bold uppercase text-muted transition group-hover:bg-accent group-hover:text-accent-ink">
              {p.type === "country" ? p.id.slice(0, 2) : p.type === "top" ? <Star size={17} /> : <Music2 size={17} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{title(p)}</span>
              <span className="text-xs text-muted">{p.count} ст.</span>
            </span>
          </button>
        ))}
        {!loading && !error && list.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Ничего не найдено.</div>}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="font-display font-semibold">Свой плейлист по ссылке</div>
        <p className="mt-0.5 text-xs text-muted">Любой M3U, M3U8 или PLS в интернете. Сервер должен разрешать запросы с других сайтов (например, GitHub raw).</p>
        <div className="mt-3 flex gap-2">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/…/list.m3u" inputMode="url" />
          <button
            className={btnPrimary + " shrink-0"}
            disabled={!/^https?:\/\//i.test(url.trim())}
            onClick={() => {
              try {
                openList(new URL(url.trim()).hostname, url.trim());
              } catch {
                toast("Некорректная ссылка", "error");
              }
            }}
          >
            <Link2 size={16} /> Открыть
          </button>
        </div>
        <button className={btnGhost + " mt-2 !py-1.5 text-xs"} onClick={() => setUrl("https://raw.githubusercontent.com/fhdm-dev/radio/master/pl/Radio%20Paradise.m3u")}>
          Подставить пример
        </button>
      </div>

      <ListModal open={!!open} onClose={() => setOpen(null)} title={open?.name} sourceContext={open ? { kind: "playlist", title: open.name } : undefined} items={stations} have={have} onPlay={onPlay} loading={plLoading} error={plError} sub={(s) => [s.genre, s.city].filter(Boolean).join(" · ") || s.url.replace(/^https?:\/\//, "").slice(0, 40)} />
    </div>
  );
}
