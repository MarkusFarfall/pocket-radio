import { useState } from "react";
import { cn } from "../utils/cn";
import { packPhoto, type Pack } from "../lib/packs";

/** Фото пака с затемнением; без сети остаётся цветной фон. */
export function Photo({ pack, w = 840, h = 420, className }: { pack: Pack; w?: number; h?: number; className?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, hsl(${pack.hue} 40% 30%), hsl(${(pack.hue + 30) % 360} 45% 14%))` }}
    >
      {ok && (
        <img
          src={packPhoto(pack.photo, w, h)}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setOk(false)}
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
    </div>
  );
}
