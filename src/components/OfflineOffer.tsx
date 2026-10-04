import { CheckCircle2, CloudOff, Play, Radio, Waves, X } from "lucide-react";
import { resilience, useOfflineOffer, useRecoveryOffer } from "../lib/resilience";
import { playlistSeconds } from "../lib/playlists";
import { fmtDuration } from "../lib/templates";
import { Modal, btnGhost } from "./ui";
import { PlaylistArtwork } from "./PlaylistArtwork";

/** Выбор музыки при обрыве связи: показываем только плейлисты, где реально есть офлайн-треки. */
export function OfflineOfferModal() {
  const offer = useOfflineOffer();
  if (!offer) return <Modal open={false} onClose={() => undefined} children={null} />;

  return (
    <Modal open onClose={() => resilience.dismissOffer()} size="sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <CloudOff size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold tracking-tight">Интернет пропал</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Трансляция «{offer.original.name}» остановлена. Пока ждём связь, можно включить уже скачанную музыку.
            </p>
          </div>
          <button onClick={() => resilience.dismissOffer()} className="-mr-2 -mt-2 rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.14em] text-muted">Доступно без сети</h3>
        <ul className="max-h-[48vh] space-y-1 overflow-y-auto">
          {offer.playlists.map(({ playlist, available }) => {
            const art = playlist.cover || playlist.items.find((i) => i.logo)?.logo;
            const sec = playlistSeconds({ items: playlist.items.filter((i) => i.local || i.kind === "lan" || i.kind === "vod") });
            return (
              <li key={playlist.id}>
                <button onClick={() => void resilience.choosePlaylist(playlist)} className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2">
                  <span className="h-[50px] w-[50px] shrink-0"><PlaylistArtwork playlist={{ ...playlist, cover: art }} eager /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{playlist.name}</span>
                    <span className="block truncate text-xs text-muted">
                      офлайн {available} из {playlist.items.length}
                      {sec > 0 && ` · ${fmtDuration(sec, true)}`}
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink opacity-90 transition group-hover:scale-105">
                    <Play size={16} className="ml-0.5 fill-current" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 border-t border-line pt-4">
          <button onClick={() => void resilience.chooseAmbient()} className={btnGhost + " w-full"}>
            <Waves size={16} /> Вместо музыки включить эмбиент
          </button>
          <button onClick={() => resilience.dismissOffer()} className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-ink">
            Оставить выключенным
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Возврат сети — постоянное решение, а не тост, который исчезнет через несколько секунд. */
export function RecoveryOfferModal() {
  const offer = useRecoveryOffer();
  if (!offer) return null;
  return (
    <div className="recovery-bar fixed inset-x-3 bottom-[calc(9.25rem+env(safe-area-inset-bottom))] z-[65] mx-auto max-w-xl rounded-2xl border border-line bg-surface/95 p-3 shadow-2xl backdrop-blur-xl lg:bottom-24 lg:right-5 lg:left-auto lg:w-[31rem]" role="status">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ok/15 text-ok"><CheckCircle2 size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Интернет вернулся</div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">Продолжить «{offer.currentTitle}» или вернуться к «{offer.original.name}»?</p>
        </div>
        <button onClick={() => resilience.continueOffline()} className="-mr-1 -mt-1 rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Продолжить офлайн"><X size={16} /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => resilience.continueOffline()} className={btnGhost + " min-w-0 !px-3 !py-2 text-xs"}><Play size={14} /> Продолжить офлайн</button>
        <button onClick={() => void resilience.returnToBroadcast()} className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-ink"><Radio size={14} /> Вернуться в эфир</button>
      </div>
    </div>
  );
}