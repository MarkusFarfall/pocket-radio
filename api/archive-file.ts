import type { IncomingMessage, ServerResponse } from "node:http";
import { CDDA_SECTOR_BYTES, MAX_CDDA_TRACK_BYTES } from "../src/lib/cdda";

interface VercelRequest extends IncomingMessage {
  query?: { mode?: string | string[]; identifier?: string | string[]; file?: string | string[] };
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

const MAX_CUE_BYTES = 512 * 1024;
const MAX_RANGE_BYTES = MAX_CDDA_TRACK_BYTES;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function safeFilePath(value: string): string | null {
  if (!value || value.length > 1_024 || value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return value;
}

function byteRange(value: string | undefined): { start: number; end: number } | null {
  const match = value?.match(/^bytes=(\d+)-(\d+)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const length = end - start + 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || length > MAX_RANGE_BYTES) return null;
  if (start % CDDA_SECTOR_BYTES !== 0 || (end + 1) % CDDA_SECTOR_BYTES !== 0) return null;
  return { start, end };
}

/** Same-origin, bounded proxy for CUE text and byte ranges from Internet Archive items. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const mode = first(req.query?.mode);
  const identifier = first(req.query?.identifier);
  const file = safeFilePath(first(req.query?.file));
  if (!/^[a-z0-9][a-z0-9._-]{0,255}$/i.test(identifier) || !file) {
    return res.status(400).json({ error: "Некорректный адрес файла Internet Archive" });
  }

  const isCue = mode === "cue" && /\.cue$/i.test(file);
  const isCdda = mode === "cdda" && /\.(?:bin|img|raw|iso)$/i.test(file);
  if (!isCue && !isCdda) return res.status(400).json({ error: "Поддерживаются только CUE-файлы и образы CD-аудио" });

  const range = isCdda ? byteRange(typeof req.headers.range === "string" ? req.headers.range : undefined) : null;
  if (isCdda && !range) return res.status(416).json({ error: "Нужен один выровненный по CD-секторам диапазон" });
  if (isCue && req.headers.range) return res.status(400).json({ error: "Для CUE-файла диапазон не нужен" });

  const path = file.split("/").map((part) => encodeURIComponent(part)).join("/");
  const upstreamUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const abortOnClose = () => controller.abort();
  res.once("close", abortOnClose);

  try {
    const headers = new Headers({ Accept: isCue ? "text/plain, application/octet-stream;q=0.9" : "application/octet-stream" });
    if (range) headers.set("Range", `bytes=${range.start}-${range.end}`);
    const upstream = await fetch(upstreamUrl, { headers, signal: controller.signal });

    if (isCue) {
      const declaredLength = Number(upstream.headers.get("content-length")) || 0;
      if (declaredLength > MAX_CUE_BYTES) {
        await upstream.body?.cancel().catch(() => undefined);
        return res.status(413).json({ error: "CUE-файл слишком большой" });
      }
      if (!upstream.ok) return res.status(502).json({ error: `Internet Archive ответил ${upstream.status}` });
      if (!upstream.body) return res.status(502).json({ error: "CUE-файл пуст" });
      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (loaded > MAX_CUE_BYTES) {
          await reader.cancel().catch(() => undefined);
          return res.status(413).json({ error: "CUE-файл слишком большой" });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(bytes);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.status(200).end(text);
    }

    if (upstream.status !== 206 || !upstream.body) {
      await upstream.body?.cancel().catch(() => undefined);
      return res.status(502).json({ error: "Internet Archive не вернул запрошенный диапазон" });
    }
    const contentRange = upstream.headers.get("content-range") ?? "";
    const declaredRange = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
    const contentLength = Number(upstream.headers.get("content-length")) || 0;
    const expectedLength = range!.end - range!.start + 1;
    if (!declaredRange || Number(declaredRange[1]) !== range!.start || Number(declaredRange[2]) !== range!.end || (contentLength && contentLength !== expectedLength)) {
      await upstream.body.cancel().catch(() => undefined);
      return res.status(502).json({ error: "Internet Archive вернул неверный диапазон" });
    }

    res.status(206);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Range", contentRange);
    res.setHeader("Content-Length", String(range!.end - range!.start + 1));
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, no-store");
    const reader = upstream.body.getReader();
    let streamed = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      streamed += value.byteLength;
      if (streamed > expectedLength) {
        await reader.cancel().catch(() => undefined);
        controller.abort();
        return res.end();
      }
      if (!res.write(Buffer.from(value))) await new Promise<void>((resolve) => res.once("drain", resolve));
    }
    return res.end();
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      return res.status(504).json({ error: "Internet Archive превысил время ожидания" });
    }
    if (!res.headersSent) return res.status(502).json({ error: "Не удалось прочитать файл Internet Archive" });
    return res.end();
  } finally {
    clearTimeout(timeout);
    res.off("close", abortOnClose);
  }
}

export const config = { maxDuration: 60 };
