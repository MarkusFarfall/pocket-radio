import { useEffect, useMemo, useState } from "react";
import type { Playlist } from "../lib/types";
import { cn } from "../utils/cn";
import { Cover } from "./ui";

type Pl = Pick<Playlist, "name" | "cover" | "items" | "follow"> & { id?: string };

/** Надёжная обложка: своя картинка, затем мозаика, затем генеративный фон. */
export function PlaylistArtwork({ playlist, className, eager = false }: { playlist: Pl; className?: string; eager?: boolean }) {
  const [bad, setBad] = useState<Set<string>>(new Set());
  const images = useMemo(() => {
    const a = [playlist.cover, playlist.follow?.art, ...playlist.items.map((i) => i.logo)].filter(
      (x): x is string => !!x && /^(https:\/\/|data:image\/)/i.test(x) && !/archive\.org\/services\/img\//i.test(x)
    );
    return Array.from(new Set(a)).filter((x) => !bad.has(x)).slice(0, 4);
  }, [playlist.cover, playlist.follow?.art, playlist.items, bad]);
  const podcast = !!playlist.follow || (playlist.items.length > 0 && playlist.items.every((i) => i.genre === "Подкасты"));

  useEffect(() => setBad(new Set()), [playlist.cover, playlist.id]);

  const fail = (src: string) => setBad((b) => new Set(b).add(src));
  const image = (src: string, i: number) => (
    <img key={src} src={src} alt="" loading={eager || i === 0 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => fail(src)} className="h-full w-full min-h-0 min-w-0 bg-surface-2 object-cover" />
  );

  return (
    <div className={cn("cover relative h-full w-full overflow-hidden rounded-xl bg-surface-2", className)} aria-hidden>
      {images.length === 1 ? (
        image(images[0], 0)
      ) : images.length >= 2 ? (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-line">
          {[0, 1, 2, 3].map((i) =>
            images[i] ? image(images[i], i) : <Cover key={i} s={{ name: `${playlist.name}${i}`, kind: "vod", icon: podcast ? "g:podcast" : "g:music" }} size="fill" className="!rounded-none" />
          )}
        </div>
      ) : (
        <Cover s={{ name: playlist.name, kind: "vod", icon: podcast ? "g:podcast" : "g:music" }} size="fill" className="!rounded-none" />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10" />
    </div>
  );
}