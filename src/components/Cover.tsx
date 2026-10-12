import { memo, useEffect, useState } from "react";
import { isGeneratedWaveformCover, isPlaceholderArtwork } from "../lib/artwork";
import { glyphIcon, type GlyphSource } from "../lib/glyphs";
import { hueOf } from "../lib/templates";
import { cn } from "../utils/cn";

export interface CoverSource extends GlyphSource {
  logo?: string;
}

const badLogos = new Set<string>();

export const Cover = memo(function Cover({
  s,
  size = 56,
  className,
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
  const mediaArtwork = s.kind === "vod" || /подкаст|podcast|музык|music|soundtrack|альбом|album/i.test(`${s.genre ?? ""} ${s.name ?? ""}`);
  const logo = s.logo && /^(https:\/\/|data:image\/)/i.test(s.logo) && !badLogos.has(s.logo) && !isPlaceholderArtwork(s.logo)
    ? s.logo
    : undefined;
  const [logoOk, setLogoOk] = useState(false);
  const [logoBad, setLogoBad] = useState(false);
  useEffect(() => {
    setLogoOk(false);
    setLogoBad(false);
  }, [logo]);
  const Icon = glyphIcon(s);
  const resolvedFit = fit === "auto" ? (mediaArtwork ? "cover" : "contain") : fit;
  const showLogo = !!logo && !logoBad;
  const fill = size === "fill";
  const px = fill ? undefined : size;
  const iconSize = px ? Math.round(px * 0.4) : undefined;
  // Обложка для станций без логотипа: детерминированный градиент по имени + инициалы.
  // Даёт каждой станции свой цвет и не выглядит «пусто». Перекрывается реальным лого,
  // если оно есть и загрузилось.
  const name = s.name ?? "";
  const hue = hueOf(name);
  const initials = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toLocaleUpperCase("ru"))
    .join("");
  return (
    <div
      className={cn("cover relative shrink-0 select-none overflow-hidden rounded-xl bg-surface-2", className)}
      style={{ width: fill ? "100%" : px, height: fill ? "100%" : px, containerType: "inline-size" }}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(140deg, hsl(${hue} 55% 46%), hsl(${(hue + 45) % 360} 62% 30%))` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        {initials ? (
          <span
            className="font-semibold tracking-tight text-white/90 drop-shadow-sm"
            style={{ fontSize: px ? Math.round(px * 0.38) : "38cqw" }}
          >
            {initials}
          </span>
        ) : (
          <Icon
            strokeWidth={1.5}
            className="text-white/70"
            style={{ width: iconSize ?? "38%", height: iconSize ?? "38%" }}
          />
        )}
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
            if (e.currentTarget.naturalWidth < 48 || isGeneratedWaveformCover(e.currentTarget)) {
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
