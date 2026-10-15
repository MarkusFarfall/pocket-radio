import { memo, useEffect, useState } from "react";
import { artworkUrl, isGeneratedWaveformCover } from "../lib/artwork";
import { glyphIcon, type GlyphSource } from "../lib/glyphs";
import { hueOf } from "../lib/templates";
import { cn } from "../utils/cn";

export interface CoverSource extends GlyphSource {
  logo?: string;
}


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
  const logo = artworkUrl(s.logo);
  const [image, setImage] = useState<{ url?: string; state?: "ready" | "failed" | "invalid" }>({});
  const logoOk = image.url === logo && image.state === "ready";
  const logoBad = image.url === logo && (image.state === "failed" || image.state === "invalid");
  useEffect(() => {
    if (image.state !== "failed") return;
    const retry = () => { if (navigator.onLine && !document.hidden) setImage({}); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => { window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", retry); };
  }, [image]);
  const Icon = glyphIcon(s);
  const resolvedFit = fit === "auto" ? (mediaArtwork ? "cover" : "contain") : fit;
  const showLogo = !!logo && !logoBad;
  const fill = size === "fill";
  const px = fill ? undefined : size;
  const iconSize = px ? Math.round(px * 0.4) : undefined;
  // Без реальной картинки: инициалы станции или музыкальная иконка, не чужая обложка.
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
      data-artwork={!logo ? "missing" : logoBad ? "error" : logoOk ? "ready" : "loading"}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(140deg, hsl(${hue} 55% 46%), hsl(${(hue + 45) % 360} 62% 30%))` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        {initials && !mediaArtwork ? (
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
          key={logo}
          src={logo}
          alt=""
          loading={eager || logo?.startsWith("data:") ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth < 2 || e.currentTarget.naturalHeight < 2 || (mediaArtwork && isGeneratedWaveformCover(e.currentTarget))) {
              setImage({ url: logo, state: "invalid" });
            } else setImage({ url: logo, state: "ready" });
          }}
          onError={() => {
            setImage({ url: logo, state: "failed" });
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
