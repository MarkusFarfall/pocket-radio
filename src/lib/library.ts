import { removeByUrl, restoreStation } from "./db";
import { player } from "./player";
import { toast } from "./toast";

/** Убрать станцию из каталога с возможностью отмены. Возвращает true, если станция была в каталоге. */
export async function removeFromLibrary(target: { url: string }, opts: { stopIfPlaying?: boolean } = {}): Promise<boolean> {
  const s = await removeByUrl(target.url);
  if (!s) return false;
  if (opts.stopIfPlaying && player.getState().station?.url === s.url) player.stop();
  toast(`«${s.name}» убрана из каталога`, "info", {
    label: "Отменить",
    run: () => {
      void restoreStation(s).then(() => toast("Станция возвращена", "ok"));
    },
  });
  return true;
}
