import { memo, useEffect, useMemo, useState } from "react";
import { cn } from "../utils/cn";
import { glyphIcon, type GlyphSource } from "../lib/glyphs";

export interface CoverSource extends GlyphSource {
  logo?: string;
}

const badLogos = new Set<string>();

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Генеративный фон обложки: узор зависит от названия, цвета приглушённые. */
function Art({ name, spin }: { name: string; spin?: boolean }) {
  const { h, variant, bars, id } = useMemo(() => {
    const seed = hash(name || "radio");
    const r = rng(seed);
    return {
      h: seed % 360,
      variant: (seed >> 5) % 5,
      bars: Array.from({ length: 9 }, () => 0.25 + r() * 0.7),
      id: "g" + seed.toString(36),
    };
  }, [name]);
  const h2 = (h + 28) % 360;
  const light = `hsl(${h} 75% 72%)`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 46% 34%)`} />
          <stop offset="1" stopColor={`hsl(${h2} 52% 16%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {variant === 0 && (
        <g className={cn(spin && "spin-slow")} style={{ transformOrigin: "78px 22px" }} fill="none" stroke={light} strokeOpacity="0.2" strokeWidth="1">
          {[14, 26, 38, 50, 62, 74].map((r) => (
            <circle key={r} cx="78" cy="22" r={r} />
          ))}
        </g>
      )}
      {variant === 1 && (
        <g fill={light} fillOpacity="0.2">
          {bars.map((b, i) => (
            <rect key={i} x={6 + i * 10} y={100 - b * 62} width="6" height={b * 62} rx="3" />
          ))}
        </g>
      )}
      {variant === 2 && (
        <g stroke={light} strokeOpacity="0.16" strokeWidth="3">
          {[-40, -20, 0, 20, 40, 60, 80, 100].map((o) => (
            <line key={o} x1={o} y1="110" x2={o + 90} y2="-10" />
          ))}
        </g>
      )}
      {variant === 3 && (
        <g fill={light} fillOpacity="0.22">
          {Array.from({ length: 36 }, (_, i) => (
            <circle key={i} cx={10 + (i % 6) * 16} cy={10 + Math.floor(i / 6) * 16} r={i % 7 === 0 ? 3.2 : 1.6} />
          ))}
        </g>
      )}
      {variant === 4 && (
        <g fill="none" stroke={light} strokeOpacity="0.22" strokeWidth="1.2">
          {[22, 36, 50, 64, 78].map((r) => (
            <path key={r} d={`M0 ${100 - r} A${r} ${r} 0 0 1 ${r} 100`} />
          ))}
        </g>
      )}
      <circle cx="18" cy="84" r="26" fill={`hsl(${h2} 80% 60%)`} fillOpacity="0.1" />
    </svg>
  );
}

export const Cover = memo(function Cover({
  s,
  size = 56,
  className,
  spin,
  eager,
  fit = "auto",
}: {
  s: CoverSource;
  size?: number | "fill";
  className?: string;
  spin?: boolean;
  eager?: boolean;
  fit?: "auto" | "contain" | "cover";
}) {
  const name = s.name ?? "";
  const fill = size === "fill";
  const mediaArtwork = s.kind === "vod" || /подкаст|podcast|музык|music|soundtrack|альбом|album/i.test(`${s.genre ?? ""} ${s.name ?? ""}`);
  // services/img у Internet Archive нередко возвращает waveform вместо обложки.
  const suspiciousArchiveThumb = mediaArtwork && /archive\.org\/services\/img\//i.test(s.logo ?? "");
  const logo = s.logo && /^(https:\/\/|data:image\/)/i.test(s.logo) && !badLogos.has(s.logo) && !suspiciousArchiveThumb ? s.logo : undefined;
  const [logoOk, setLogoOk] = useState(false);
  const [logoBad, setLogoBad] = useState(false);
  useEffect(() => {
    setLogoOk(false);
    setLogoBad(false);
  }, [logo]);
  const Icon = glyphIcon(s);
  const resolvedFit = fit === "auto" ? (mediaArtwork ? "cover" : "contain") : fit;
  const showLogo = !!logo && !logoBad;
  const px = fill ? undefined : (size as number);
  const iconSize = px ? Math.round(px * 0.4) : undefined;
  return (
    <div
      className={cn("cover relative shrink-0 select-none overflow-hidden rounded-xl bg-neutral-800", className)}
      style={{ width: fill ? "100%" : px, height: fill ? "100%" : px }}
      aria-hidden
    >
      <Art name={name} spin={spin} />
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon
          strokeWidth={1.5}
          className="text-white/90 drop-shadow"
          style={{ width: iconSize ?? "38%", height: iconSize ?? "38%" }}
        />
      </div>
      {showLogo && (
        <img
          src={logo}
          alt=""
          loading={eager || logo?.startsWith("data:") ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth;
            if (w < 48) {
              badLogos.add(logo!);
              setLogoBad(true);
            } else setLogoOk(true);
          }}
          onError={() => {
            badLogos.add(logo!);
            setLogoBad(true);
          }}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-300",
            resolvedFit === "cover" ? "bg-surface-2 object-cover p-0" : "bg-white object-contain p-[12%]",
            logoOk ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10" />
    </div>
  );
});
