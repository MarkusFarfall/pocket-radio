/**
 * Сигналы об изменениях для движка синхронизации.
 *
 * Слой данных не должен зависеть от сети и от React, поэтому он лишь сообщает,
 * какие документы могли измениться. Движок сам решает, когда их отправить.
 */

type Listener = (keys: string[]) => void;

const listeners = new Set<Listener>();
const pending = new Set<string>();
let scheduled = false;

function flush() {
  scheduled = false;
  if (!listeners.size || !pending.size) return;
  const keys = [...pending];
  pending.clear();
  listeners.forEach((listener) => listener(keys));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  // Несколько записей подряд (bulkAdd, транзакция) собираются в одну пачку.
  queueMicrotask(flush);
}

export function markSyncKey(key: string) {
  pending.add(key);
  schedule();
}

export function markSyncKeys(keys: Iterable<string>) {
  for (const key of keys) pending.add(key);
  schedule();
}

/** Полная сверка: нужна после массовых операций и удалений. */
export function markSyncAll() {
  pending.add("*");
  schedule();
}

export function onSyncSignal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Для диагностики в тестах. */
export const pendingSyncKeys = () => [...pending];
