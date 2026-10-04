import { db } from "./db";
import { pool, probeStream } from "./probe";
import type { Station } from "./types";

export interface CheckProgress {
  done: number;
  total: number;
  bad: number;
}

/** Проверяет станции пачками по 3 и сохраняет результат в каталоге. */
export async function checkStations(list: Station[], onProgress?: (p: CheckProgress) => void, shouldStop?: () => boolean) {
  let done = 0;
  let bad = 0;
  onProgress?.({ done, total: list.length, bad });
  await pool(
    list,
    3,
    async (s) => {
      const r = await probeStream(s.url, s.kind, 9000);
      await db.stations.update(s.id, { health: { ok: r.ok, ts: Date.now(), ms: r.ms, msg: r.ok ? undefined : r.message } });
      done++;
      if (!r.ok) bad++;
      onProgress?.({ done, total: list.length, bad });
    },
    shouldStop
  );
  return { done, bad };
}
