/**
 * Монитор интернет-соединения.
 * navigator.onLine и событие offline могут срабатывать при переключении VPN, хотя интернет уже есть.
 * Сначала проверяем heartbeat приложения, а при его недоступности — несколько независимых адресов.
 * Один недоступный домен поэтому не означает, что пропал весь интернет.
 */

const PROBE_PATH = "/connectivity.txt";
const PROBE_BODY = "pocket-radio-online";
const APP_TIMEOUT = 1200;
const EXTERNAL_TIMEOUT = 3500;
const MAX_PROBE_BYTES = 256;
const EXTERNAL_PROBES = [
  "https://connectivitycheck.gstatic.com/generate_204",
  "https://cp.cloudflare.com/generate_204",
  "https://connectivity-check.ubuntu.com/",
];

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

function withCacheBuster(rawUrl: string): URL {
  const url = new URL(rawUrl);
  url.searchParams.set("pr_ping", String(Date.now()));
  return url;
}

class Connectivity {
  // До первой успешной проверки не выдаём браузерный флаг за подтверждённый доступ в интернет.
  private online = false;
  private fast = false;
  private listeners = new Set<() => void>();
  private inflight: Promise<boolean> | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    // VPN может кратко вызвать offline даже при работающем обычном подключении — перепроверяем, не сбрасываем статус сразу.
    window.addEventListener("offline", () => void this.probe());
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

  /** Проверка реального доступа к сети; navigator.onLine намеренно не определяет результат. */
  probe(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async probeAppOrigin(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), APP_TIMEOUT);
    try {
      const url = withCacheBuster(new URL(PROBE_PATH, location.origin).href);
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: ctl.signal });
      const finalUrl = new URL(res.url || url.href, url.href);
      if (!res.ok || finalUrl.origin !== location.origin) {
        void res.body?.cancel().catch(() => undefined);
        return false;
      }
      const body = await readProbeText(res);
      return body !== null && body.trim() === PROBE_BODY;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }
  }

  /**
   * The public checks intentionally use no-cors: their 204 responses do not expose CORS headers,
   * but a resolved opaque response still confirms that DNS/TLS/network access reached that host.
   */
  private async probeExternal(rawUrl: string, signal: AbortSignal): Promise<boolean> {
    try {
      const url = withCacheBuster(rawUrl);
      const res = await fetch(url, {
        mode: "no-cors",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal,
      });
      return !res.redirected && (res.type === "opaque" || (res.ok && res.status === 204));
    } catch {
      return false;
    }
  }

  private async probeExternalHosts(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), EXTERNAL_TIMEOUT);
    const probes = EXTERNAL_PROBES.map((url) => this.probeExternal(url, ctl.signal));
    try {
      return await new Promise<boolean>((resolve) => {
        let pending = probes.length;
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          if (ok) {
            settled = true;
            resolve(true);
            return;
          }
          pending -= 1;
          if (pending === 0) {
            settled = true;
            resolve(false);
          }
        };
        probes.forEach((probe) => void probe.then(finish, () => finish(false)));
      });
    } finally {
      clearTimeout(timer);
      ctl.abort();
    }
  }

  private async run(): Promise<boolean> {
    // Сначала используем собственный небольшой endpoint. Если домен блокируется или возвращает страницу-заглушку,
    // независимые проверки уточнят, работает ли интернет через другие адреса.
    const online = (await this.probeAppOrigin()) || (await this.probeExternalHosts());
    this.set(online);
    return online;
  }
}

export const connectivity = new Connectivity();
