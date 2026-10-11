import { useCallback, useState } from "react";
import type { Tab } from "../views/shared";

/** История разделов для кнопок «назад» и «вперёд» без анимации всего приложения. */
export function useTabHistory(initial: Tab) {
  const [h, setH] = useState<{ stack: Tab[]; i: number }>({ stack: [initial], i: 0 });

  const go = useCallback((t: Tab) => setH((s) => {
    if (s.stack[s.i] === t) return s;
    const stack = [...s.stack.slice(0, s.i + 1), t].slice(-30);
    return { stack, i: stack.length - 1 };
  }), []);
  const back = useCallback(() => setH((s) => (s.i > 0 ? { ...s, i: s.i - 1 } : s)), []);
  const forward = useCallback(() => setH((s) => (s.i < s.stack.length - 1 ? { ...s, i: s.i + 1 } : s)), []);

  return { tab: h.stack[h.i], go, back, forward, canBack: h.i > 0, canForward: h.i < h.stack.length - 1 };
}
