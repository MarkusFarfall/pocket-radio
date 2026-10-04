import { addMany, importJSON } from "./db";
import { parseM3U } from "./m3u";
import { toast } from "./toast";

export async function importText(text: string, filename = ""): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  try {
    if (filename.endsWith(".json") || t.startsWith("{") || t.startsWith("[")) {
      const r = await importJSON(t);
      const parts = [`станций: ${r.added}`];
      if (r.sessions) parts.push(`сессий: ${r.sessions}`);
      if (r.tracks) parts.push(`треков: ${r.tracks}`);
      toast(`Импортировано — ${parts.join(", ")}`, r.added || r.sessions || r.tracks ? "ok" : "info");
    } else {
      const list = parseM3U(t);
      if (!list.length) {
        toast("Не нашли ни одной станции в файле", "error");
        return false;
      }
      const n = await addMany(list);
      toast(`Импортировано станций: ${n} из ${list.length}${n < list.length ? " (остальные уже были)" : ""}`, n ? "ok" : "info");
    }
    return true;
  } catch (e) {
    toast(`Не удалось импортировать: ${(e as Error).message}`, "error");
    return false;
  }
}

export async function importFile(file: File): Promise<boolean> {
  if (file.size > 20 * 1024 * 1024) {
    toast("Файл слишком большой для импорта", "error");
    return false;
  }
  return importText(await file.text(), file.name.toLowerCase());
}

export async function importUrl(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
    const text = await r.text();
    if (/#EXT-X-(STREAM-INF|TARGETDURATION)/.test(text)) {
      // это манифест одного HLS-потока, а не список станций
      const n = await addMany([{ name: new URL(url).hostname, url, kind: "hls" }]);
      toast(n ? "Добавлен HLS-поток" : "Такой поток уже есть", n ? "ok" : "info");
      return !!n;
    }
    return importText(text, new URL(url).pathname.toLowerCase());
  } catch (e) {
    const err = e as Error;
    toast(
      err.name === "TypeError" || err.name === "AbortError"
        ? "Не удалось загрузить плейлист: нет сети или сервер не разрешает CORS. Скачайте файл и импортируйте его вручную"
        : `Не удалось загрузить плейлист: ${err.message}`,
      "error"
    );
    return false;
  }
}
