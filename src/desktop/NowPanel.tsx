import { useMemo } from "react";
import { BookmarkPlus, Copy, Disc3, Heart, ListMusic, PanelRightClose, Pencil, QrCode, Share2, Trash2 } from "lucide-react";
import type { Station } from "../lib/types";
import { player, usePlayer } from "../lib/player";
import { saveTrack, toggleFavoriteAny, trackLabel } from "../lib/db";
import { removeFromLibrary } from "../lib/library";
import { setDesktopPrefs, useDesktopPrefs, type PanelTab } from "../lib/desktop";
import { useSavedStation } from "../lib/hooks";
import { fmtBytes, hueOf, KIND_LABEL } from "../lib/templates";
import { toast } from "../lib/toast";
import { cn } from "../utils/cn";
import { Cover, Equalizer, btnGhost } from "../components/ui";
import { SleepTimer, statusText } from "../components/PlayerUI";
import { FallbackBanner } from "../components/FallbackBanner";
import { VodCacheButton } from "../components/VodCache";
import { shareStation } from "../components/Share";
import { AddToPlaylistButton } from "../components/PlaylistPicker";
import { mediaLabel } from "../lib/media";

const SHELL = "flex w-[21rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface 2xl:w-[24rem]";

function Head() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between px-5">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Сейчас играет</span>
      <button onClick={() => setDesktopPrefs({ panel: false })} className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Скрыть панель" title="Скрыть панель (P)">
        <PanelRightClose size={18} />
      </button>
    </div>
  );
}

/** Правая панель компоновки «Студия»: что играет, сведения о станции, названия треков и очередь. */
export function NowPanel({ stations, onEdit, onQr }: { stations: Station[]; onEdit: (s: Station) => void; onQr: (s: Station) => void }) {
  const p = usePlayer();
  const dp = useDesktopPrefs();
  const st = p.station;
  const saved = useSavedStation(st);
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const queue = useMemo(() => p.queue.map((id) => byId.get(id)).filter((s): s is Station => !!s), [p.queue, byId]);

  if (!st)
    return (
      <aside className={SHELL}>
        <Head />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-muted">
            <Disc3 size={30} />
          </span>
          <div className="font-display text-lg font-semibold">Тишина в эфире</div>
          <p className="text-sm leading-relaxed text-muted">Выберите станцию слева или в каталоге — здесь появятся обложка, названия треков и очередь.</p>
        </div>
      </aside>
    );

  const hue = hueOf(st.name);
  const active = p.status === "playing" || p.status === "buffering" || p.status === "loading";
  const fav = !!saved?.favorite;
  const tab = dp.panelTab;
  const tabs: [PanelTab, string][] = [
    ["about", "О станции"],
    ["tracks", `Треки${p.history.length ? ` · ${p.history.length}` : ""}`],
    ["queue", `Далее${queue.length > 1 ? ` · ${queue.length}` : ""}`],
  ];
  const act = "flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition hover:bg-surface-2";

  return (
    <aside className={SHELL}>
      <Head />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40 blur-3xl" style={{ background: `radial-gradient(circle at 50% 25%, hsl(${hue} 80% 55%), transparent 70%)` }} />
        <div className="relative">
          <Cover s={st} size="fill" className={cn("aspect-square rounded-2xl shadow-2xl ring-1 ring-black/10 transition-transform duration-500", active ? "scale-100" : "scale-[0.96]")} spin={active} />

          <div className="mt-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {p.status === "playing" && <Equalizer active className="h-3 text-accent" />}
              <span className={p.status === "error" ? "text-bad" : ""}>{statusText(p)}</span>
              {p.fromCache && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">из кэша</span>}
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight">{p.meta?.title || st.name}</h2>
            <p className="mt-1 text-sm text-muted">{p.meta?.title ? [p.meta.artist, st.name].filter(Boolean).join(" · ") : [st.genre, st.city].filter(Boolean).join(" · ") || KIND_LABEL[st.kind]}</p>
          </div>

          <div className="mt-4 flex gap-1 rounded-2xl border border-line p-1">
            <button
              className={cn(act, fav && "text-accent")}
              onClick={async () => toast((await toggleFavoriteAny(st)) ? "Добавлено в избранное" : "Убрано из избранного", "info")}
            >
              <Heart size={18} className={fav ? "fill-current" : ""} /> {fav ? "В избранном" : "Избранное"}
            </button>
            <button className={act} onClick={() => shareStation(st)}>
              <Share2 size={18} /> Ссылка
            </button>
            <button className={act} onClick={() => onQr(st)}>
              <QrCode size={18} /> QR
            </button>
            {saved && (
              <button className={act} onClick={() => onEdit(saved)}>
                <Pencil size={18} /> Изменить
              </button>
            )}
          </div>

          {p.fallback && (
            <div className="mt-4">
              <FallbackBanner />
            </div>
          )}
          {p.status === "error" && p.error && (
            <div className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">
              {p.error}
              <button onClick={() => void player.resume()} className="ml-2 font-semibold underline underline-offset-2">
                Повторить
              </button>
            </div>
          )}

          <div className="mt-5 flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setDesktopPrefs({ panelTab: id })}
                className={cn("flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition", tab === id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "about" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">{p.isLive ? KIND_LABEL[st.kind] : mediaLabel(st, false)}</span>
                  {st.genre && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">{st.genre}</span>}
                  {st.mood && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">{st.mood}</span>}
                  {st.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                      #{t}
                    </span>
                  ))}
                </div>
                {st.note && <p className="text-sm leading-relaxed text-muted">{st.note}</p>}
                <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
                  <span className="min-w-0 flex-1 truncate font-mono">{st.url}</span>
                  <button onClick={() => navigator.clipboard.writeText(st.url).then(() => toast("Адрес скопирован", "ok"))} className="shrink-0 rounded-lg p-1 hover:text-ink" aria-label="Копировать адрес">
                    <Copy size={14} />
                  </button>
                </div>
                <p className="text-xs text-muted">≈ {fmtBytes((st.bitrate * 3600 * 1000) / 8)} трафика в час{p.dataSaver ? " (экономия включена)" : ""}</p>
                <AddToPlaylistButton station={st} className={cn(btnGhost, "w-full")} label="Добавить в плейлист" />
                <SleepTimer sleepAt={p.sleepAt} />
                {st.kind === "vod" && saved && <VodCacheButton station={st} />}
                {saved && (
                  <button className={cn(btnGhost, "w-full !text-bad")} onClick={() => void removeFromLibrary({ url: saved.url }, { stopIfPlaying: true })}>
                    <Trash2 size={16} /> Убрать из каталога
                  </button>
                )}
              </div>
            )}

            {tab === "tracks" &&
              (p.history.length ? (
                <ul className="divide-y divide-line">
                  {p.history.map((t, i) => (
                    <li key={`${t.ts}-${i}`} className="flex items-center gap-1 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="truncate text-xs text-muted">
                          {t.artist ? `${t.artist} · ` : ""}
                          {new Date(t.ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <button
                        onClick={async () => toast((await saveTrack({ title: t.title, artist: t.artist, station: t.stationName, stationId: t.stationId })) ? "Трек сохранён" : "Уже в сохранённых", "ok")}
                        className="rounded-lg p-2 text-muted transition hover:text-accent"
                        aria-label="Сохранить трек"
                      >
                        <BookmarkPlus size={16} />
                      </button>
                      <button onClick={() => navigator.clipboard.writeText(trackLabel(t)).then(() => toast("Скопировано", "ok"))} className="rounded-lg p-2 text-muted transition hover:text-ink" aria-label="Копировать название">
                        <Copy size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-muted">Названия треков появятся, когда станция начнёт их передавать. Читаются они только у серверов, которые разрешают чтение с других сайтов (CORS).</p>
              ))}

            {tab === "queue" &&
              (queue.length ? (
                <ul className="-mx-2">
                  {queue.map((s) => {
                    const cur = s.id === st.id;
                    return (
                      <li key={s.id}>
                        <button onClick={() => !cur && void player.play(s)} className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2", cur && "bg-accent/10")}>
                          <Cover s={s} size={38} className="rounded-lg" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{s.name}</span>
                            <span className="block truncate text-xs text-muted">{[s.genre, s.city].filter(Boolean).join(" · ") || KIND_LABEL[s.kind]}</span>
                          </span>
                          {cur && <Equalizer active={active} className="h-3 text-accent" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 p-5 text-center text-sm text-muted">
                  <ListMusic size={22} />В очереди только эта станция.
                </div>
              ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
