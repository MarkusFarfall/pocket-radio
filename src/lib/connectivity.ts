/**
 * Монитор интернет-соединения.
 * navigator.onLine врёт: «есть Wi-Fi» не значит «есть интернет». Поэтому, когда что-то идёт не так
 * (событие offline, зависший поток), мы дополнительно проверяем реальную связь лёгким запросом.
 * Запросы идут только в этих случаях и пока приложение считает, что связи нет, — в обычной работе трафика нет.
 */

const PROBES = ["https://www.gstatic.com/generate_204", "https://cp.cloudflare.com/generate_204"];
const TIMEOUT = 4000;

class Connectivity {
  private online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
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
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.set(false);
      return Promise.resolve(false);
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async run(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    const ok = await new Promise<boolean>((resolve) => {
      let pending = PROBES.length;
      for (const url of PROBES) {
        fetch(`${url}?t=${Date.now()}`, { mode: "no-cors", cache: "no-store", signal: ctl.signal })
          .then(() => true)
          .catch(() => false)
          .then((good) => {
            if (good) resolve(true);
            else if (--pending === 0) resolve(false);
          });
      }
    });
    clearTimeout(timer);
    ctl.abort();
    this.set(ok);
    return ok;
  }
}

export const connectivity = new Connectivity();
