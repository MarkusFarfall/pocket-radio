import { useEffect, useState } from "react";
import { ListPlus, Loader2, Plus } from "lucide-react";
import type { Station } from "../lib/types";
import { closePicker, gotoPlaylist, openPicker, usePicker } from "../lib/picker";
import { addItems, createPlaylist, stationToItem, usePlaylists } from "../lib/playlists";
import { toast } from "../lib/toast";
import { Modal, btnGhost, btnPrimary, inputCls } from "./ui";
import { PlaylistArtwork } from "./PlaylistArtwork";

export const tracksWord = (n: number) => {
  const m = n % 100;
  if (m > 10 && m < 15) return "треков";
  const r = n % 10;
  return r === 1 ? "трек" : r > 1 && r < 5 ? "трека" : "треков";
};

/** Окно «Добавить в плейлист»: выбрать существующий плейлист или создать новый. Один на всё приложение. */
export function PlaylistPicker() {
  const req = usePicker();
  const lists = usePlaylists() ?? [];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (req) setName(req.suggest ?? "");
  }, [req]);

  if (!req) return <Modal open={false} onClose={closePicker} children={null} />;

  const n = req.items.length;
  const summary = n === 1 ? req.items[0].title : `${n} ${tracksWord(n)}`;

  const addTo = async (id: string, title: string) => {
    setBusy(true);
    try {
      const added = await addItems(id, req.items);
      closePicker();
      toast(added ? `Добавлено: ${added} → «${title}»` : `Эти треки уже есть в «${title}»`, added ? "ok" : "info", { label: "Открыть", run: () => gotoPlaylist(id) });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const p = await createPlaylist(name || req.suggest || "Новый плейлист", req.items, { follow: req.follow, cover: req.cover });
      closePicker();
      toast(`Плейлист «${p.name}» создан`, "ok", { label: "Открыть", run: () => gotoPlaylist(p.id) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={closePicker} size="sm" title="В плейлист">
      <div className="p-5">
        <p className="truncate text-sm text-muted">{summary}</p>

        {lists.length > 0 && (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {lists.map((l) => (
              <li key={l.id}>
                <button disabled={busy} onClick={() => void addTo(l.id, l.name)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-surface-2 disabled:opacity-60">
                  <span className="h-10 w-10 shrink-0"><PlaylistArtwork playlist={l} eager /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{l.name}</span>
                    <span className="block text-xs text-muted">
                      {l.items.length} {tracksWord(l.items.length)}
                    </span>
                  </span>
                  <Plus size={17} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Новый плейлист</label>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && void create()}
              placeholder="Например, «Дорога» или «Хиты шансона»"
              maxLength={80}
              autoFocus={lists.length === 0}
            />
            <button className={btnPrimary + " shrink-0"} disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Создать
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Кнопка «В плейлист» для одной станции. */
export function AddToPlaylistButton({ station, className, label = "В плейлист", size = 18 }: { station: Station; className?: string; label?: string; size?: number }) {
  return (
    <button className={className ?? btnGhost} onClick={() => openPicker({ items: [stationToItem(station)], suggest: station.kind === "vod" ? station.city || station.name : undefined })}>
      <ListPlus size={size} /> {label}
    </button>
  );
}
