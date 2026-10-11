export const CDDA_SECTOR_BYTES = 2_352;
const CDDA_SUBCHANNEL_BYTES = 96;
const CDDA_RAW_SUBCHANNEL_SECTOR_BYTES = CDDA_SECTOR_BYTES + CDDA_SUBCHANNEL_BYTES;
export const CDDA_SECTORS_PER_SECOND = 75;
export const MAX_CDDA_TRACK_BYTES = 144 * 1024 * 1024;
export type CddaByteOrder = "little" | "big";

export interface CueSourceFile {
  name: string;
  size?: string | number;
  format?: string;
}

export interface CueAudioTrack {
  number: number;
  title?: string;
  performer?: string;
  file: CueSourceFile;
  byteOrder: CddaByteOrder;
  startSector: number;
  endSector: number;
}

interface CueFileRef {
  name: string;
  type: string;
}

interface CueTrackDraft {
  number: number;
  mode: string;
  file: CueFileRef;
  indexes: Map<number, number>;
  title?: string;
  performer?: string;
}

function cuePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").toLocaleLowerCase("en-US");
}

function cueValue(value: string): string {
  const quoted = value.trim().match(/^"((?:[^"]|"")*)"$/);
  return (quoted ? quoted[1].replace(/""/g, '"') : value.trim()).trim();
}

function cueTime(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,4}):(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const frames = Number(match[3]);
  if (!Number.isSafeInteger(minutes) || seconds > 59 || frames >= CDDA_SECTORS_PER_SECOND) return undefined;
  return (minutes * 60 + seconds) * CDDA_SECTORS_PER_SECOND + frames;
}

function sourceForCueFile(name: string, files: CueSourceFile[]): CueSourceFile | undefined {
  const normalized = cuePath(name);
  const exact = files.find((file) => cuePath(file.name) === normalized);
  if (exact) return exact;
  const basename = normalized.split("/").at(-1);
  if (!basename) return undefined;
  const matches = files.filter((file) => cuePath(file.name).split("/").at(-1) === basename);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Parses audio tracks from a CUE sheet whose sources are raw, 2352-byte CD sectors. */
export function parseCueSheet(text: string, files: CueSourceFile[]): CueAudioTrack[] {
  const drafts: CueTrackDraft[] = [];
  let currentFile: CueFileRef | undefined;
  let currentTrack: CueTrackDraft | undefined;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^REM\s/i.test(line)) continue;

    const fileMatch = line.match(/^FILE\s+(?:"((?:[^"]|"")*)"|(\S+))\s+(\S+)/i);
    if (fileMatch) {
      currentFile = { name: cueValue(fileMatch[1] ?? fileMatch[2]), type: fileMatch[3].toUpperCase() };
      currentTrack = undefined;
      continue;
    }

    const trackMatch = line.match(/^TRACK\s+(\d{1,3})\s+(\S+)/i);
    if (trackMatch && currentFile) {
      currentTrack = {
        number: Number(trackMatch[1]),
        mode: trackMatch[2].toUpperCase(),
        file: currentFile,
        indexes: new Map(),
      };
      drafts.push(currentTrack);
      continue;
    }

    if (!currentTrack) continue;
    const indexMatch = line.match(/^INDEX\s+(\d{1,2})\s+(\d{1,4}:\d{2}:\d{2})/i);
    if (indexMatch) {
      const index = Number(indexMatch[1]);
      const sector = cueTime(indexMatch[2]);
      if (sector !== undefined) currentTrack.indexes.set(index, sector);
      continue;
    }

    const titleMatch = line.match(/^TITLE\s+(.+)$/i);
    if (titleMatch) currentTrack.title = cueValue(titleMatch[1]);
    const performerMatch = line.match(/^PERFORMER\s+(.+)$/i);
    if (performerMatch) currentTrack.performer = cueValue(performerMatch[1]);
  }

  const out: CueAudioTrack[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const track = drafts[i];
    if (track.mode !== "AUDIO" || !["BINARY", "MOTOROLA"].includes(track.file.type)) continue;
    if (!/\.(?:bin|img|raw|iso)$/i.test(track.file.name)) continue;

    const file = sourceForCueFile(track.file.name, files);
    const size = Number(file?.size);
    if (!file || !Number.isSafeInteger(size) || size < CDDA_SECTOR_BYTES || size % CDDA_SECTOR_BYTES !== 0) continue;
    const totalSectors = size / CDDA_SECTOR_BYTES;
    // If the same byte length also fits 2448-byte sectors, require a matching separate .cdg stream.
    if (size % CDDA_RAW_SUBCHANNEL_SECTOR_BYTES === 0) {
      const sidecar = sourceForCueFile(track.file.name.replace(/\.(?:bin|img|raw|iso)$/i, ".cdg"), files);
      if (!sidecar || Number(sidecar.size) !== totalSectors * CDDA_SUBCHANNEL_BYTES) continue;
    }
    const startSector = track.indexes.get(1);
    if (totalSectors < 1 || startSector === undefined || startSector >= totalSectors) continue;

    let nextSector: number | undefined;
    for (let j = i + 1; j < drafts.length; j++) {
      const next = drafts[j];
      if (cuePath(next.file.name) !== cuePath(track.file.name)) continue;
      nextSector = next.indexes.get(0) ?? next.indexes.get(1);
      if (nextSector !== undefined) break;
    }
    const endSector = Math.min(nextSector ?? totalSectors, totalSectors);
    const trackBytes = (endSector - startSector) * CDDA_SECTOR_BYTES;
    if (endSector <= startSector || !Number.isSafeInteger(trackBytes) || trackBytes > MAX_CDDA_TRACK_BYTES) continue;

    out.push({
      number: track.number,
      title: track.title,
      performer: track.performer,
      file,
      byteOrder: track.file.type === "MOTOROLA" ? "big" : "little",
      startSector,
      endSector,
    });
  }
  return out;
}

export function makeCddaTrackUrl(imageUrl: string, trackNumber: number, startSector: number, endSector: number, byteOrder: CddaByteOrder = "little"): string {
  const url = new URL(imageUrl);
  url.hash = `pocket-radio-cdda=${trackNumber},${startSector},${endSector},${byteOrder}`;
  return url.toString();
}

export interface CddaReference {
  sourceUrl: string;
  identifier: string;
  file: string;
  trackNumber: number;
  byteOrder: CddaByteOrder;
  startSector: number;
  endSector: number;
}

export function parseCddaTrackUrl(value: string): CddaReference | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "archive.org") return null;
    const match = url.hash.match(/^#?pocket-radio-cdda=(\d+),(\d+),(\d+)(?:,(little|big))?$/i);
    if (!match) return null;
    const path = url.pathname.split("/").filter(Boolean);
    if (path[0] !== "download" || path.length < 3) return null;
    const identifier = decodeURIComponent(path[1]);
    const file = path.slice(2).map((part) => decodeURIComponent(part)).join("/");
    const trackNumber = Number(match[1]);
    const startSector = Number(match[2]);
    const endSector = Number(match[3]);
    const byteOrder: CddaByteOrder = match[4]?.toLowerCase() === "big" ? "big" : "little";
    const bytes = (endSector - startSector) * CDDA_SECTOR_BYTES;
    if (!/^[a-z0-9][a-z0-9._-]{0,255}$/i.test(identifier)) return null;
    if (!file || file.split("/").some((part) => !part || part === "." || part === "..")) return null;
    if (!Number.isSafeInteger(trackNumber) || trackNumber < 1 || trackNumber > 99) return null;
    if (!Number.isSafeInteger(startSector) || startSector < 0 || !Number.isSafeInteger(endSector) || endSector <= startSector) return null;
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
    url.hash = "";
    return { sourceUrl: url.toString(), identifier, file, trackNumber, byteOrder, startSector, endSector };
  } catch {
    return null;
  }
}

function wavHeader(dataBytes: number): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 44_100, true);
  view.setUint32(28, 176_400, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  return header;
}

/** Wraps raw CD-DA PCM in a browser-compatible little-endian WAV container. */
export function cddaPcmToWav(raw: ArrayBuffer, byteOrder: CddaByteOrder = "little"): Blob {
  if (raw.byteLength === 0 || raw.byteLength % CDDA_SECTOR_BYTES !== 0) {
    throw new Error("CD-образ содержит неполный аудиосектор");
  }
  if (raw.byteLength > MAX_CDDA_TRACK_BYTES) throw new Error("Эта дорожка слишком большая для безопасной обработки на телефоне");
  const pcm = new Uint8Array(raw);
  if (byteOrder === "big") {
    for (let i = 0; i < pcm.length; i += 2) {
      const first = pcm[i];
      pcm[i] = pcm[i + 1];
      pcm[i + 1] = first;
    }
  }
  return new Blob([wavHeader(pcm.byteLength), pcm], { type: "audio/wav" });
}

async function readRangeBody(response: Response, expectedBytes: number, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const body = response.body;
  if (!body) {
    const data = await response.arrayBuffer();
    if (data.byteLength !== expectedBytes) throw new Error("Архив прислал неполную CD-дорожку");
    onProgress?.(data.byteLength, expectedBytes);
    return data;
  }

  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      if (loaded > expectedBytes) throw new Error("Архив прислал больше данных, чем запросили");
      chunks.push(value);
      onProgress?.(loaded, expectedBytes);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (loaded !== expectedBytes) throw new Error("Архив прислал неполную CD-дорожку");

  const data = new Uint8Array(expectedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data.buffer;
}

/** Fetches only the selected CD sectors through the same-origin Archive range proxy. */
export async function fetchCddaWav(value: string, signal?: AbortSignal, onProgress?: (loaded: number, total: number) => void): Promise<Blob> {
  const reference = parseCddaTrackUrl(value);
  if (!reference) throw new Error("Некорректная ссылка на CD-дорожку");
  const startByte = reference.startSector * CDDA_SECTOR_BYTES;
  const endByte = reference.endSector * CDDA_SECTOR_BYTES - 1;
  const expectedBytes = endByte - startByte + 1;
  if (!Number.isSafeInteger(endByte) || expectedBytes <= 0 || expectedBytes > MAX_CDDA_TRACK_BYTES) {
    throw new Error("Дорожка слишком большая для обработки на этом устройстве");
  }

  const params = new URLSearchParams({ mode: "cdda", identifier: reference.identifier, file: reference.file });
  const response = await fetch(`/api/archive-file?${params.toString()}`, {
    headers: { Range: `bytes=${startByte}-${endByte}` },
    signal,
  });
  if (response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(response.status === 502
      ? "Архив не смог отдать фрагмент диска"
      : "Источник не поддерживает чтение дорожек по частям");
  }
  const contentRange = response.headers.get("content-range")?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!contentRange || Number(contentRange[1]) !== startByte || Number(contentRange[2]) !== endByte) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Архив вернул неверный диапазон CD-дорожки");
  }
  if (!response.ok) throw new Error(`Архив ответил ${response.status}`);

  const pcm = await readRangeBody(response, expectedBytes, onProgress);
  return cddaPcmToWav(pcm, reference.byteOrder);
}
