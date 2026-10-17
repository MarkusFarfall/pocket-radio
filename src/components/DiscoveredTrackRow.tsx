import { Download, ExternalLink, ListPlus, Play } from "lucide-react";
import type { DiscoveredMusicTrack } from "../lib/discoveredMusic";
import { fmtClock } from "../lib/templates";
import { Cover } from "./ui";

/**
 * Строка трека из открытого каталога: лицензия, длительность, ссылка на оригинал,
 * прослушивание и добавление в плейлист. Скачивание предлагается только там,
 * где источник явно его разрешает (например, Audius — по желанию автора).
 */
export function DiscoveredTrackRow({
  track,
  onPlay,
  onAdd,
}: {
  track: DiscoveredMusicTrack;
  onPlay: () => void;
  onAdd: (download: boolean) => void;
}) {
  const downloadable = track.canDownload !== false;
  return (
    <article data-provider-track={track.id} className="flex items-center gap-2 rounded-xl p-2 transition hover:bg-surface-2 sm:gap-3">
      <Cover s={{ name: track.title, logo: track.logo, kind: "vod", genre: "Музыка", icon: "g:music" }} size={46} className="shrink-0 rounded-lg" eager fit="cover" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">{track.title}</div>
        <div className="mt-0.5 truncate text-xs text-muted">{track.creator || "Автор не указан"} · {track.providerName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <a className="font-semibold text-accent hover:underline" href={track.licenseUrl || track.landingUrl} target="_blank" rel="noreferrer" aria-label={`Лицензия: ${track.title}`}>
            {track.licenseName}
          </a>
          {track.duration ? <span>{fmtClock(track.duration)}</span> : null}
          <a className="inline-flex items-center gap-0.5 hover:text-accent" href={track.landingUrl} target="_blank" rel="noreferrer" aria-label={`Оригинал: ${track.title}`}>
            Оригинал <ExternalLink size={10} />
          </a>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onPlay} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-95" aria-label={`Слушать «${track.title}»`} title="Слушать">
          <Play size={15} className="ml-0.5 fill-current" />
        </button>
        <button type="button" onClick={() => onAdd(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink" aria-label={`В плейлист: ${track.title}`} title="Добавить в плейлист">
          <ListPlus size={17} />
        </button>
        {downloadable && (
          <button type="button" onClick={() => onAdd(true)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-accent" aria-label={`Скачать офлайн: ${track.title}`} title="Добавить и скачать офлайн">
            <Download size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
