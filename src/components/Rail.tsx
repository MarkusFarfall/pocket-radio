import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";

/** Горизонтальная лента: на телефоне листается пальцем, на компьютере — кнопками-стрелками. */
export function Rail({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [can, setCan] = useState({ l: false, r: false });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setCan((p) => (p.l === l && p.r === r ? p : { l, r }));
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  const btn = "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-lg transition hover:bg-surface-2 md:flex";

  return (
    <div className="relative">
      {can.l && (
        <button onClick={() => go(-1)} className={cn(btn, "-left-3")} aria-label="Прокрутить влево">
          <ChevronLeft size={20} />
        </button>
      )}
      <div ref={ref} onScroll={update} className={cn("no-scrollbar flex overflow-x-auto", className)}>
        {children}
      </div>
      {can.r && (
        <button onClick={() => go(1)} className={cn(btn, "-right-3")} aria-label="Прокрутить вправо">
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
