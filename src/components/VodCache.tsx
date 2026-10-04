import { useRef, useState } from "react";
import { CircleCheck, Download, Loader2, Trash2 } from "lucide-react";
import type { Station } from "../lib/types";
import { useOfflineItems } from "../lib/hooks";
import { downloadVod, removeVod } from "../lib/offline";
import { fmtBytes } from "../lib/templates";
import { toast } from "../lib/toast";
import { btnGhost } from "./ui";

/** Кнопка «скачать для офлайна» — только для podcast/VOD. */
export function VodCacheButton({ station }: { station: Station }) {
  const items = useOfflineItems();
  const item = items.find((i) => i.stationId === station.id);
  const [prog, setProg] = useState<{ loaded: number; total: number } | null>(null);
  const ctl = useRef<AbortController | null>(null);

  if (station.kind !== "vod") return null;

  const start = async () => {
    ctl.current = new AbortController();
    setProg({ loaded: 0, total: 0 });
    try {
      const size = await downloadVod(station, (loaded, total) => setProg({ loaded, total }), ctl.current.signal);
      toast(`Сохранено для офлайна · ${fmtBytes(size)}`, "ok");
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError")
        toast(
          err.message.includes("fetch") || err.name === "TypeError"
            ? "Не удалось скачать: сервер не разрешает CORS. Файл можно слушать только онлайн"
            : `Не удалось скачать: ${err.message}`,
          "error"
        );
    } finally {
      setProg(null);
    }
  };

  if (prog)
    return (
      <button onClick={() => ctl.current?.abort()} className={btnGhost + " w-full"}>
        <Loader2 size={16} className="animate-spin" />
        {prog.total ? `${Math.round((prog.loaded / prog.total) * 100)}%` : fmtBytes(prog.loaded)} · отмена
      </button>
    );

  if (item)
    return (
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-ok/15 px-3.5 py-2.5 text-sm font-semibold text-ok">
          <CircleCheck size={16} /> Доступно офлайн · {fmtBytes(item.size)}
        </div>
        <button onClick={() => removeVod(station)} className={btnGhost} aria-label="Удалить из кэша">
          <Trash2 size={16} />
        </button>
      </div>
    );

  return (
    <button onClick={start} className={btnGhost + " w-full"}>
      <Download size={16} /> Скачать для офлайна
    </button>
  );
}
