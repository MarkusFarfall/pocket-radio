import { addMany, importJSON } from "./db";
import { parseM3U } from "./m3u";
import { validUrl } from "./templates";
import { toast } from "./toast";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const URL_IMPORT_TIMEOUT = 12000;

async function readTextLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) throw new Error("Плейлист больше 20 МБ — скачайте и сократите его перед импортом");
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error("Плейлист больше 20 МБ — скачайте и сократите его перед импортом");
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_BYTES) throw new Error("Плейлист больше 20 МБ — скачайте и сократите его перед импортом");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  } finally {
    reader.releaseLock();
  }
}

export async function importText(text: string, filename = ""): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  if (new TextEncoder().encode(t).byteLength > MAX_IMPORT_BYTES) {
    toast("Импорт больше 20 МБ — сократите файл перед импортом", "error");
    return false;
  }
  try {
    if (filename.endsWith(".json") || t.startsWith("{") || t.startsWith("[")) {
      const r = await importJSON(t);
      const parts = [`станций: ${r.added}`];
      if (r.sessions) parts.push(`сессий: ${r.sessions}`);
      if (r.events) parts.push(`событий: ${r.events}`);
      if (r.tracks) parts.push(`треков: ${r.tracks}`);
      if (r.playlists) parts.push(`плейлистов: ${r.playlists}`);
      if (r.progress) parts.push(`позиции: ${r.progress}`);
      toast(`Импортировано — ${parts.join(", ")}`, r.added || r.sessions || r.events || r.tracks || r.playlists || r.progress ? "ok" : "info");
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
  if (file.size > MAX_IMPORT_BYTES) {
    toast("Файл слишком большой для импорта", "error");
    return false;
  }
  try {
    return await importText(await file.text(), file.name.toLowerCase());
  } catch (e) {
    toast(`Не удалось прочитать файл: ${(e as Error).message}`, "error");
    return false;
  }
}

export async function importUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    toast("Укажите корректный адрес плейлиста", "error");
    return false;
  }
  if (!validUrl(url.href)) {
    toast("Поддерживаются только ссылки HTTP и HTTPS", "error");
    return false;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), URL_IMPORT_TIMEOUT);
  try {
    const response = await fetch(url.href, { signal: ctl.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
    const text = await readTextLimited(response);
    if (/#EXT-X-(STREAM-INF|TARGETDURATION)/.test(text)) {
      // это манифест одного HLS-потока, а не список станций
      const n = await addMany([{ name: url.hostname, url: url.href, kind: "hls" }]);
      toast(n ? "Добавлен HLS-поток" : "Такой поток уже есть", n ? "ok" : "info");
      return !!n;
    }
    return await importText(text, url.pathname.toLowerCase());
  } catch (e) {
    const err = e as Error;
    toast(
      err.name === "AbortError"
        ? "Импорт по ссылке занял слишком много времени. Проверьте адрес и попробуйте ещё раз"
        : err.name === "TypeError"
          ? "Не удалось загрузить плейлист: нет сети или сервер не разрешает CORS. Скачайте файл и импортируйте его вручную"
          : `Не удалось импортировать: ${err.message}`,
      "error"
    );
    return false;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}
