import type Hls from "hls.js";
import type { StreamKind } from "./types";
import { mixedContentRisk } from "./templates";

export interface ProbeResult {
  ok: boolean;
  ms: number;
  message: string;
}

/** Беззвучно пробует открыть поток и сообщает, отвечает ли он. Ничего не воспроизводит. */
export function probeStream(url: string, kind: StreamKind, timeoutMs = 9000): Promise<ProbeResult> {
  const t0 = performance.now();
  const a = new Audio();
  a.preload = "auto";
  a.muted = true;
  let hls: Hls | null = null;

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean, message: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        a.pause();
        hls?.destroy();
        a.removeAttribute("src");
        a.load();
      } catch {
        /* ignore */
      }
      resolve({ ok, ms: Math.round(performance.now() - t0), message });
    };
    const timer = setTimeout(() => finish(false, `Нет ответа за ${Math.round(timeoutMs / 1000)} с`), timeoutMs);

    a.addEventListener("canplay", () => finish(true, "Поток отвечает"));
    a.addEventListener("loadeddata", () => finish(true, "Поток отвечает"));
    a.addEventListener("error", () => {
      const code = a.error?.code;
      if (mixedContentRisk(url)) return finish(false, "Заблокировано: http-поток на https-странице");
      if (code === 2) return finish(false, "Сетевая ошибка");
      if (code === 3) return finish(false, "Ошибка декодирования");
      finish(false, "Адрес недоступен или формат не поддерживается");
    });

    const isHls = kind === "hls" || /\.m3u8(\?|$)/i.test(url);
    if (isHls && !a.canPlayType("application/vnd.apple.mpegurl")) {
      import("hls.js")
        .then(({ default: H }) => {
          if (done) return;
          if (!H.isSupported()) return finish(false, "HLS не поддерживается в этом браузере");
          hls = new H({ startLevel: 0, maxBufferLength: 6 });
          hls.on(H.Events.MANIFEST_PARSED, () => finish(true, "Плейлист HLS загружен"));
          hls.on(H.Events.ERROR, (_e, d) => d.fatal && finish(false, `Ошибка HLS: ${d.details}`));
          hls.loadSource(url);
          hls.attachMedia(a);
        })
        .catch(() => finish(false, "Не удалось загрузить модуль HLS"));
    } else {
      let src = url;
      if (kind === "shoutcast") {
        try {
          const u = new URL(url);
          if (u.pathname === "/") {
            u.pathname = "/;";
            src = u.toString();
          }
        } catch {
          /* ignore */
        }
      }
      a.src = src;
      a.load();
    }
  });
}

/** Прогоняет задачи с ограничением параллелизма. */
export async function pool<T>(items: T[], size: number, fn: (x: T, i: number) => Promise<void>, shouldStop?: () => boolean) {
  let i = 0;
  const worker = async () => {
    while (i < items.length && !shouldStop?.()) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
