import { useCallback, useState } from "react";
import type { Tab } from "../views/shared";

/** Переходы между разделами с историей: кнопки «назад» и «вперёд», как в браузере. */
export function useTabHistory(initial: Tab) {
  const [h, setH] = useState<{ stack: Tab[]; i: number }>({ stack: [initial], i: 0 });

  const change = useCallback((fn: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(fn);
    else fn();
  }, []);

  const go = useCallback((t: Tab) => {
    change(() => setH((s) => {
      if (s.stack[s.i] === t) return s;
      const stack = [...s.stack.slice(0, s.i + 1), t].slice(-30);
      return { stack, i: stack.length - 1 };
    }));
  }, [change]);
  const back = useCallback(() => change(() => setH((s) => (s.i > 0 ? { ...s, i: s.i - 1 } : s))), [change]);
  const forward = useCallback(() => change(() => setH((s) => (s.i < s.stack.length - 1 ? { ...s, i: s.i + 1 } : s))), [change]);

  return { tab: h.stack[h.i], go, back, forward, canBack: h.i > 0, canForward: h.i < h.stack.length - 1 };
}
