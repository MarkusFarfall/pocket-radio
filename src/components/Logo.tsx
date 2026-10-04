import { cn } from "../utils/cn";

/** Фирменный логотип: PWA-иконка, экран входа и бренд на компьютере. */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return <img src="/icon-512.jpg" alt="" width={size} height={size} draggable={false} style={{ width: size, height: size }} className={cn("shrink-0 rounded-[22%] object-cover shadow-sm", className)} />;
}
