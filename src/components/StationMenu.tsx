import { useEffect, useState } from "react";
import { Activity, Copy, Heart, ListPlus, Pencil, Play, QrCode, Share2, Trash2, type LucideIcon } from "lucide-react";
import { openPicker } from "../lib/picker";
import { stationToItem } from "../lib/playlists";
import type { Station } from "../lib/types";
import { db, toggleFavorite } from "../lib/db";
import { removeFromLibrary } from "../lib/library";
import { probeStream } from "../lib/probe";
import { toast } from "../lib/toast";
import { Cover, Modal } from "./ui";
import { VodCacheButton } from "./VodCache";
import { shareStation } from "./Share";
import { KindBadge } from "./kind";
import { cn } from "../utils/cn";

interface Props {
  station: Station | null;
  onClose: () => void;
  onPlay: (s: Station) => void;
  onEdit: (s: Station) => void;
  onQr: (s: Station) => void;
}

function Item({ icon: I, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium transition hover:bg-surface-2",
        danger && "text-bad"
      )}
    >
      <I size={19} className={danger ? "" : "text-muted"} />
      {label}
    </button>
  );
}

export function StationMenu({ station, onClose, onPlay, onEdit, onQr }: Props) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [station]);
  if (!station) return <Modal open={false} onClose={onClose} children={null} />;
  const s = station;
  return (
    <Modal open onClose={onClose} size="sm">
      <div className="p-3">
        <div className="flex items-center gap-3 px-2 pb-3 pt-2">
          <Cover s={s} size={52} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-bold">{s.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <KindBadge kind={s.kind} />
              {s.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-xs text-muted">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        </div>
        {s.note && <p className="mx-2 mb-2 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-muted">{s.note}</p>}
        <Item icon={Play} label="Слушать" onClick={() => (onPlay(s), onClose())} />
        <Item
          icon={Heart}
          label={s.favorite ? "Убрать из избранного" : "В избранное"}
          onClick={() => (toggleFavorite(s), onClose())}
        />
        <Item icon={Pencil} label="Редактировать" onClick={() => (onEdit(s), onClose())} />
        <Item icon={Share2} label="Поделиться ссылкой" onClick={() => (shareStation(s), onClose())} />
        <Item
          icon={ListPlus}
          label="Добавить в плейлист"
          onClick={() => {
            openPicker({ items: [stationToItem(s)], suggest: s.kind === "vod" ? s.city || s.name : undefined });
            onClose();
          }}
        />
        <Item icon={QrCode} label="Показать QR-код" onClick={() => (onQr(s), onClose())} />
        <Item
          icon={Copy}
          label="Копировать адрес потока"
          onClick={() => {
            navigator.clipboard.writeText(s.url).then(
              () => toast("Адрес скопирован", "ok"),
              () => toast("Не удалось скопировать", "error")
            );
            onClose();
          }}
        />
        {s.kind !== "vod" && (
          <Item
            icon={Activity}
            label="Проверить, отвечает ли поток"
            onClick={async () => {
              onClose();
              toast("Проверяем поток…", "info");
              const r = await probeStream(s.url, s.kind);
              await db.stations.update(s.id, { health: { ok: r.ok, ts: Date.now(), ms: r.ms, msg: r.ok ? undefined : r.message } });
              toast(r.ok ? `«${s.name}» отвечает (${r.ms} мс)` : `«${s.name}»: ${r.message}`, r.ok ? "ok" : "error");
            }}
          />
        )}
        {s.kind === "vod" && (
          <div className="px-2 py-1.5">
            <VodCacheButton station={s} />
          </div>
        )}
        {confirm ? (
          <div className="mt-1 flex items-center gap-2 rounded-xl bg-bad/10 p-2">
            <span className="flex-1 px-2 text-sm font-medium text-bad">Удалить навсегда?</span>
            <button className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-2" onClick={() => setConfirm(false)}>
              Нет
            </button>
            <button
              className="rounded-lg bg-bad px-3 py-2 text-sm font-semibold text-white"
              onClick={async () => {
                await removeFromLibrary({ url: s.url }, { stopIfPlaying: true });
                onClose();
              }}
            >
              Удалить
            </button>
          </div>
        ) : (
          <Item icon={Trash2} label="Удалить" danger onClick={() => setConfirm(true)} />
        )}
      </div>
    </Modal>
  );
}
