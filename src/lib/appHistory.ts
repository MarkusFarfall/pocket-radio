import { useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "../views/shared";

/**
 * Мост между историей браузера и навигацией приложения.
 *
 * Каждое действие (смена раздела, открытие модального окна) добавляет запись в историю,
 * поэтому системная кнопка «назад» на телефоне выполняет действие внутри приложения,
 * а не закрывает его. На корневом экране первая «назад» показывает подсказку и остаётся
 * в приложении: закрывает приложение только второе нажатие.
 *
 * Шаг, закрытый программно (крестик, Esc, смена раздела), помечается как stale: запись
 * истории остаётся, но нажатие «назад» не сгорает впустую — приложение идёт дальше и
 * отменяет настоящий предыдущий шаг.
 */

export interface NavStep {
  undo: () => void;
  redo: () => void;
  /** Модальные окна закрываются при смене раздела — их шаги снимаются заранее. */
  overlay: boolean;
  /** Слой уже закрыт программно: отменять нечего, но запись истории ещё впереди. */
  stale: boolean;
}

interface EntryState {
  prApp: true;
  pr: number;
}

const stack: NavStep[] = [];
let cursor = -1;
let entry: EntryState | null = null;
let inited = false;
let rootHint: (() => void) | null = null;
let rootHintAt = 0;
const listeners = new Set<() => void>();

function stateOf(pr: number): EntryState {
  return { prApp: true, pr };
}

function prOf(state: unknown): number | null {
  const s = state as EntryState | null;
  if (!s || s.prApp !== true || typeof s.pr !== "number") return null;
  return s.pr;
}

function notify() {
  for (const listener of listeners) listener();
}

/** true — есть шаг истории приложения, который можно отменить. */
export function canGoBack() {
  return cursor >= 0;
}

export function canGoForward() {
  return cursor + 1 < stack.length;
}

/** Системная «назад»: если в приложении есть шаг, он будет отменён. */
export function goBack() {
  if (canGoBack()) history.back();
}

export function goForward() {
  if (canGoForward()) history.forward();
}

export function pushStep(undo: () => void, redo?: () => void, overlay = false): NavStep {
  const step: NavStep = { undo, redo: redo ?? (() => undefined), overlay, stale: false };
  stack.length = cursor + 1;
  stack.push(step);
  cursor += 1;
  entry = stateOf(cursor + 1);
  history.pushState(entry, "", location.href);
  notify();
  return step;
}

/** Программное закрытие слоя: снимать запись истории не нужно, шаг отметится при обходе. */
export function dropStep(step?: NavStep | null) {
  const target = step ?? stack[cursor];
  if (target) target.stale = true;
}

/** Смена раздела закрывает модальные окна: их шаги помечаются до записи нового раздела. */
export function closeOverlaySteps() {
  for (let i = cursor; i >= 0; i -= 1) {
    if (!stack[i].overlay) break;
    stack[i].stale = true;
  }
}

export function initBackNav(onRootBack?: () => void) {
  if (inited || typeof window === "undefined") return;
  inited = true;
  rootHint = onRootBack ?? null;
  history.replaceState(stateOf(0), "", location.href);
  // Ловушка: первая «назад» на корневом экране остаётся внутри приложения.
  history.pushState(stateOf(0), "", location.href);
  entry = history.state as EntryState;
  window.addEventListener("popstate", onPopState);
}

function onPopState(event: PopStateEvent) {
  const arrived = prOf(event.state);
  const cameFrom = entry;
  if (!cameFrom || arrived === null) {
    // Вышли за пределы истории приложения: дальше решает браузер.
    entry = arrived === null ? null : (event.state as EntryState);
    return;
  }
  entry = event.state as EntryState;
  const before = cursor + 1;
  let applied = 0;
  // Шаги не выбрасываем: браузерная кнопка «вперёд» должна их повторить.
  while (cursor >= 0 && cursor + 1 > arrived) {
    const step = stack[cursor];
    cursor -= 1;
    if (!step.stale) {
      step.undo();
      applied += 1;
    }
  }
  while (cursor + 1 < arrived && stack[cursor + 1]) {
    cursor += 1;
    const step = stack[cursor];
    if (!step.stale) {
      step.redo();
      applied += 1;
    }
  }
  if (cursor + 1 !== arrived) {
    entry = stateOf(cursor + 1);
    history.replaceState(entry, "", location.href);
  }
  notify();
  if (applied > 0) return;
  // Нажатие не дало видимого результата: идём дальше в ту же сторону.
  if (arrived < before && cursor >= 0) return history.back();
  if (arrived > before && cursor + 1 < stack.length) return history.forward();
  if (arrived <= before && cursor < 0) showRootHint();
}

function showRootHint() {
  if (!rootHint) return;
  const now = Date.now();
  if (now - rootHintAt < 1500) return;
  rootHintAt = now;
  rootHint();
}

/** Подписка компонентов на доступность «назад» и «вперёд». */
export function useBackNav() {
  const [pos, setPos] = useState(() => ({ back: canGoBack(), forward: canGoForward() }));
  useEffect(() => {
    const update = () => setPos({ back: canGoBack(), forward: canGoForward() });
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return { back: goBack, forward: goForward, canBack: pos.back, canForward: pos.forward };
}

/** Состояние, каждое изменение которого становится шагом истории приложения. */
export function useForwardState<T>(initial: T): [T, (next: T) => void, (next: T) => void] {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(value);
  valueRef.current = value;
  const stepRef = useRef<NavStep | null>(null);

  const set = useCallback((next: T) => {
    const previous = valueRef.current;
    if (Object.is(previous, next)) return;
    if (stepRef.current) dropStep(stepRef.current);
    stepRef.current = pushStep(
      () => {
        stepRef.current = null;
        valueRef.current = previous;
        setValue(previous);
      },
      () => {
        valueRef.current = next;
        setValue(next);
      }
    );
    valueRef.current = next;
    setValue(next);
  }, []);

  /** Возврат без записи в историю: шаг помечается пройденным. */
  const close = useCallback((next: T) => {
    if (stepRef.current) dropStep(stepRef.current);
    valueRef.current = next;
    setValue(next);
  }, []);

  return [value, set, close];
}

/** Разделы приложения живут в истории браузера: «назад» возвращает предыдущий раздел. */
export function useTabNav(initial: Tab) {
  const [tab, setTabState] = useState<Tab>(initial);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const go = useCallback((next: Tab) => {
    const previous = tabRef.current;
    if (previous === next) return;
    closeOverlaySteps();
    pushStep(
      () => {
        tabRef.current = previous;
        setTabState(previous);
      },
      () => {
        tabRef.current = next;
        setTabState(next);
      }
    );
    tabRef.current = next;
    setTabState(next);
  }, []);

  return { tab, go };
}
