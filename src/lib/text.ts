/**
 * Исправляет mojibake: UTF-8, который сервер или ID3-тег ошибочно объявил как latin1/cp1251.
 * Пример: «ÐœÑƒÐ·Ñ‹ÐºÐ°» / «РњСѓР·С‹РєР°» → «Музыка».
 */

let cp1251Reverse: Map<string, number> | null = null;

function cpMap(): Map<string, number> {
  if (cp1251Reverse) return cp1251Reverse;
  const m = new Map<string, number>();
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const chars = new TextDecoder("windows-1251").decode(bytes);
  Array.from(chars).forEach((c, i) => m.set(c, i));
  cp1251Reverse = m;
  return m;
}

function bytesLatin(s: string): Uint8Array | null {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n > 255) return null;
    out[i] = n;
  }
  return out;
}

function bytesCp(s: string): Uint8Array | null {
  const map = cpMap();
  const chars = Array.from(s);
  const out = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    const n = map.get(chars[i]);
    if (n === undefined) return null;
    out[i] = n;
  }
  return out;
}

function utf8(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function badness(s: string): number {
  let n = 0;
  n += (s.match(/[�□]/g) ?? []).length * 12;
  n += (s.match(/[ÃÂÐÑ]/g) ?? []).length * 4;
  n += (s.match(/[РС][А-Яа-яЁё]/g) ?? []).length * 3;
  n += (s.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) ?? []).length * 8;
  // Чередование «А + квадратик/мусор» тоже характерно для сломанного UTF.
  n += (s.match(/[А-ЯЁ][^\p{L}\p{N}\s.,!?:;()'"\-]{1,2}/gu) ?? []).length * 2;
  return n;
}

export function fixText(raw: string | undefined | null): string {
  if (!raw) return "";
  let value = raw.replace(/\0/g, "").trim();
  for (let round = 0; round < 3; round++) {
    const candidates = [utf8(bytesLatin(value)), utf8(bytesCp(value))].filter((x): x is string => !!x && x !== value);
    let best = value;
    let score = badness(value);
    for (const c of candidates) {
      const s = badness(c);
      if (s < score) {
        best = c;
        score = s;
      }
    }
    if (best === value) break;
    value = best;
  }
  return value.replace(/\s+/g, " ").trim();
}

/** Выбирает самый читаемый вариант из нескольких декодировок. */
export function bestText(...variants: string[]): string {
  return variants.map(fixText).filter(Boolean).sort((a, b) => badness(a) - badness(b) || b.length - a.length)[0] ?? "";
}