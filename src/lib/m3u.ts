import type { Draft, Station } from "./types";
import { guessKind, validUrl } from "./templates";
import { guessGenre } from "./genres";

export function parseM3U(text: string): Draft[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const out: Draft[] = [];

  // PLS
  if (/^\[playlist\]/i.test(lines[0] ?? "")) {
    const files: Record<string, string> = {};
    const titles: Record<string, string> = {};
    for (const l of lines) {
      const f = l.match(/^File(\d+)=(.+)$/i);
      const t = l.match(/^Title(\d+)=(.+)$/i);
      if (f) files[f[1]] = f[2];
      if (t) titles[t[1]] = t[2];
    }
    Object.keys(files).forEach((k) => {
      if (validUrl(files[k])) out.push({ name: titles[k], url: files[k], kind: guessKind(files[k]) });
    });
    return out;
  }

  let pending: Draft | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      const stripped = line.replace(/([\w-]+)="([^"]*)"/g, (_, k: string, v: string) => {
        attrs[k.toLowerCase()] = v;
        return "";
      });
      const comma = stripped.indexOf(",");
      const name = (comma >= 0 ? stripped.slice(comma + 1) : "").trim();
      const logo = (attrs["tvg-logo"] || "").replace(/^http:\/\//i, "https://");
      const group = attrs["group-title"] || "";
      const g = guessGenre(`${group} ${name}`);
      pending = {
        name: name || attrs["tvg-name"],
        genre: g.genre || undefined,
        mood: g.mood || undefined,
        city: attrs["tvg-country"] || undefined,
        logo: /^https:\/\//i.test(logo) && !/\.(ico|svg)(\?|$)/i.test(logo) ? logo : undefined,
      };
    } else if (!line.startsWith("#")) {
      if (validUrl(line)) out.push({ ...(pending ?? {}), url: line, kind: guessKind(line) });
      pending = null;
    }
  }
  return out;
}

export function exportM3U(stations: Station[]): string {
  const lines = ["#EXTM3U"];
  for (const s of stations) {
    const attrs = [s.logo ? `tvg-logo="${s.logo}"` : "", s.genre ? `group-title="${s.genre}"` : ""].filter(Boolean).join(" ");
    lines.push(`#EXTINF:-1 ${attrs},${s.name}`.replace("EXTINF:-1 ,", "EXTINF:-1,"));
    lines.push(s.url);
  }
  return lines.join("\n") + "\n";
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
