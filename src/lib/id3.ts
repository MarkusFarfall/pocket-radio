/** Чтение названия, исполнителя, альбома и встроенного JPEG/PNG из тегов ID3 (v1, v2.2–v2.4). Кириллица в cp1251 читается корректно. */

export interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  picture?: Blob;
}
import { bestText, fixText } from "./text";

const synch = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function decodeFrame(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let text = "";
  try {
    if (enc === 0) {
      text = bestText(new TextDecoder("windows-1251").decode(body), new TextDecoder("iso-8859-1").decode(body), new TextDecoder("utf-8").decode(body));
    }
    else if (enc === 1) {
      const le = body[0] === 0xff && body[1] === 0xfe;
      const be = body[0] === 0xfe && body[1] === 0xff;
      text = new TextDecoder(be ? "utf-16be" : "utf-16le").decode(le || be ? body.subarray(2) : body);
    } else if (enc === 2) text = new TextDecoder("utf-16be").decode(body);
    else text = new TextDecoder("utf-8").decode(body);
  } catch {
    text = "";
  }
  return fixText(text.split("\0")[0]);
}

/** ID3 APIC/PIC; only embedded raster bytes, never external image links. */
function pictureFrame(bytes: Uint8Array, legacy: boolean): { picture: Blob; front: boolean } | undefined {
  const encoding = bytes[0];
  let at = 1;
  if (legacy) at += 3;
  else { while (at < bytes.length && bytes[at]) at++; at++; }
  const front = bytes[at++] === 3;
  if (encoding === 1 || encoding === 2) {
    while (at + 1 < bytes.length && (bytes[at] || bytes[at + 1])) at += 2;
    at += 2;
  } else { while (at < bytes.length && bytes[at]) at++; at++; }
  const data = bytes.subarray(at);
  const type = data[0] === 0xff && data[1] === 0xd8 ? "image/jpeg" : data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 ? "image/png" : undefined;
  if (!type || data.length < 16 || data.length > 4 * 1024 * 1024) return;
  return { picture: new Blob([new Uint8Array(data).buffer], { type }), front };
}

export async function readTags(file: File): Promise<Tags> {
  const out: Tags = {};
  try {
    const prefix = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    const tagLength = prefix.length === 10 && prefix[0] === 0x49 && prefix[1] === 0x44 && prefix[2] === 0x33 ? 10 + synch(prefix, 6) : 10;
    const head = new Uint8Array(await file.slice(0, Math.min(tagLength, 4 * 1024 * 1024)).arrayBuffer());
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const ver = head[3];
      const flags = head[5];
      const total = Math.min(head.length, 10 + synch(head, 6));
      let pos = 10;
      if (flags & 0x40) pos += ver === 4 ? synch(head, pos) : be32(head, pos) + 4;
      const idLen = ver === 2 ? 3 : 4;
      const hdr = ver === 2 ? 6 : 10;
      while (pos + hdr <= total) {
        const id = String.fromCharCode(...Array.from(head.subarray(pos, pos + idLen)));
        if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
        const size = ver === 2 ? (head[pos + 3] << 16) | (head[pos + 4] << 8) | head[pos + 5] : ver === 4 ? synch(head, pos + 4) : be32(head, pos + 4);
        const start = pos + hdr;
        if (size <= 0 || start + size > total) break;
        const val = () => decodeFrame(head.subarray(start, start + size));
        if (id === "TIT2" || id === "TT2") out.title = val();
        else if (id === "TPE1" || id === "TP1") out.artist = val();
        else if (id === "TALB" || id === "TAL") out.album = val();
        else if (id === "APIC" || id === "PIC") {
          // Do not interpret compressed/encrypted payloads as image data.
          const frameFlags = ver === 2 ? 0 : head[pos + 9];
          if (!(flags & 0x80) && !(frameFlags & (ver === 4 ? 0x4f : 0xe0))) {
            const art = pictureFrame(head.subarray(start, start + size), ver === 2);
            if (art && (!out.picture || art.front)) out.picture = art.picture;
          }
        }
        pos = start + size;
      }
    }
    if (!out.title) {
      const tail = new Uint8Array(await file.slice(-128).arrayBuffer());
      if (tail.length === 128 && tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
        const dec = (a: number, b: number) => fixText(new TextDecoder("windows-1251").decode(tail.subarray(a, b)).split("\0")[0]);
        out.title = dec(3, 33) || out.title;
        out.artist = out.artist || dec(33, 63) || undefined;
      }
    }
  } catch {
    /* тегов нет или файл не читается — возьмём имя файла */
  }
  return out;
}
