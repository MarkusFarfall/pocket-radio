/**
 * Монитор интернет-соединения.
 * navigator.onLine врёт: «есть Wi-Fi» не значит «есть интернет». Поэтому, когда что-то идёт не так
 * (запуск приложения, событие offline, зависший поток), мы проверяем реальную связь лёгким запросом.
 * После успешной проверки запрос повторяется только при потере связи или в ускоренном режиме восстановления.
 */

const PROBE_PATH = "/connectivity.txt";
const PROBE_BODY = "pocket-radio-online";
const TIMEOUT = 4000;
const MAX_PROBE_BYTES = 256;

async function readProbeText(response: Response): Promise<string | null> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_PROBE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength <= MAX_PROBE_BYTES ? text : null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROBE_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

class Connectivity {
  // До проверки heartbeat не выдаём браузерный флаг за подтверждённый доступ в интернет.
  private online = false;
  private fast = false;
  private listeners = new Set<() => void>();
  private inflight: Promise<boolean> | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    window.addEventListener("offline", () => this.set(false));
    window.addEventListener("online", () => void this.probe());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !this.online) void this.probe();
    });
    // пока связи нет (или идёт режим ожидания возврата) — проверяем раз в несколько секунд
    window.setInterval(() => {
      if (!this.online || this.fast) void this.probe();
    }, 6000);
    void this.probe();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  isOnline = () => this.online;

  private set(v: boolean) {
    if (v === this.online) return;
    this.online = v;
    this.listeners.forEach((f) => f());
  }

  /** Ускоренная проверка (каждые 6 с) — пока ждём возвращения интернета. */
  setFast(v: boolean) {
    this.fast = v;
  }

  /** Проверка настоящей связи. Возвращает true, если интернет доступен. */
  probe(): Promise<boolean> {
    // navigator.onLine может оставаться false после восстановления VPN или Wi-Fi;
    // проверяем реальные endpoint-ы и не используем этот флаг как окончательный ответ.
    if (this.inflight) return this.inflight;
    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async run(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const url = new URL(PROBE_PATH, location.origin);
      url.searchParams.set("t", String(Date.now()));
      const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
      const finalUrl = new URL(res.url || url.href, url.href);
      if (!res.ok || finalUrl.origin !== location.origin) {
        void res.body?.cancel().catch(() => undefined);
        this.set(false);
        return false;
      }
      const body = await readProbeText(res);
      const ok = body !== null && body.trim() === PROBE_BODY;
      this.set(ok);
      return ok;
    } catch {
      this.set(false);
      return false;
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }
  }
}

export const connectivity = new Connectivity();
