/**
 * Общий клиент MusicBrainz: не больше одного запроса в секунду, повторы при перегрузке.
 * Очередь общая для всей вкладки, поэтому дискография и треклист не мешают друг другу.
 */

const MB_INTERVAL = 1_100;
const REQUEST_TIMEOUT = 15_000;
const USER_AGENT = "PocketRadio/1.0 (https://github.com/MarkusFarfall/pocket-radio)";

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function timedSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), REQUEST_TIMEOUT);
  const onAbort = () => controller.abort(new DOMException("Aborted", "AbortError"));
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

export function mbJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const run = async (): Promise<T> => {
    let lastError: unknown = new Error("MusicBrainz не ответил");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const wait = MB_INTERVAL - (Date.now() - lastAt);
      if (wait > 0) await sleep(wait, signal);
      lastAt = Date.now();
      const gate = timedSignal(signal);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          signal: gate.signal,
        });
        if (response.status === 503 || response.status === 429) {
          lastError = new Error("MusicBrainz перегружен");
          gate.done();
          await sleep(1_200 * (attempt + 1), signal);
          continue;
        }
        if (!response.ok) {
          gate.done();
          throw new Error(`MusicBrainz ответил ${response.status}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        gate.done();
        lastError = error;
        if (signal?.aborted) throw error;
        await sleep(900 * (attempt + 1), signal).catch(() => undefined);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("MusicBrainz недоступен");
  };
  const queued = chain.then(run, run);
  chain = queued.catch(() => undefined);
  return queued;
}
