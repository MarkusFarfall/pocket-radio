import { readTags } from "./id3";
import { itemStationId, localUrl } from "./playlists";
import { uid } from "./templates";
import { toast } from "./toast";
import type { PlaylistItem } from "./types";
import { putOfflineBlob } from "./offline";

/** Свои песни с устройства: кладём файл во встроенное офлайн-хранилище, чтобы играл без интернета. */

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|weba)$/i;
const MIME: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", wav: "audio/wav", weba: "audio/webm" };

export const isAudioFile = (f: File) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name);

function audioDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    let timer = 0;
    const done = (v?: number) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      a.removeAttribute("src");
      resolve(v);
    };
    timer = window.setTimeout(() => done(), 6000);
    a.onloadedmetadata = () => done(isFinite(a.duration) ? Math.round(a.duration) : undefined);
    a.onerror = () => done();
    a.src = url;
  });
}

const nameToTitle = (name: string) =>
  name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, "")
    .replace(/_/g, " ")
    .trim();

/** Добавляет файлы в офлайн-хранилище и возвращает готовые треки (в плейлист их кладёт вызывающий). */
export async function addLocalFiles(files: File[]): Promise<{ items: PlaylistItem[]; skipped: number }> {
  if (typeof caches === "undefined") {
    toast("Этот браузер не поддерживает офлайн-хранилище", "error");
    return { items: [], skipped: files.length };
  }
  const audio = files.filter(isAudioFile);
  const items: PlaylistItem[] = [];
  let skipped = files.length - audio.length;
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* необязательно */
  }
  for (const file of audio) {
    try {
      const id = `lf-${uid()}`;
      const [tags, duration] = await Promise.all([readTags(file), audioDuration(file)]);
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      await putOfflineBlob(itemStationId(id), localUrl(id), file, file.type || MIME[ext] || "audio/mpeg", file.size);
      items.push({
        id,
        title: tags.title || nameToTitle(file.name) || "Без названия",
        subtitle: tags.artist || tags.album || undefined,
        url: localUrl(id),
        kind: "vod",
        genre: "Музыка",
        duration,
        local: true,
        addedAt: Date.now(),
      });
    } catch (e) {
      skipped++;
      if ((e as Error).name === "QuotaExceededError") {
        toast("Не хватило места на устройстве. Часть файлов не добавлена", "error");
        break;
      }
    }
  }
  if (skipped && audio.length === 0) toast("Это не аудиофайлы: подходят mp3, m4a, ogg, flac, wav", "error");
  return { items, skipped };
}
