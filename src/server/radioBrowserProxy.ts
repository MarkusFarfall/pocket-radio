import type { IncomingMessage, ServerResponse } from "node:http";

export interface RadioBrowserRequest extends IncomingMessage {}

export interface RadioBrowserResponse extends ServerResponse {
  status(code: number): RadioBrowserResponse;
  json(body: unknown): RadioBrowserResponse;
}

export type RadioBrowserRoute = "search" | "tags" | "countries" | "languages" | "click";

const UPSTREAMS = [
  "https://all.api.radio-browser.info",
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
];
const UPSTREAM_TIMEOUT_MS = 2_200;
const SEARCH_QUERY = new Set(["name", "tag", "countrycode", "language", "codec", "bitrateMin", "order", "reverse", "limit", "offset", "hidebroken", "is_https"]);
const LIST_QUERY = new Set(["order", "reverse", "limit", "hidebroken"]);
const ROUTES: Record<Exclude<RadioBrowserRoute, "click">, string> = {
  search: "json/stations/search",
  tags: "json/tags",
  countries: "json/countries",
  languages: "json/languages",
};

function fail(res: RadioBrowserResponse, status: number, error: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error });
}

/** Same-origin, allow-listed proxy for Radio Browser's JSON API. */
export async function proxyRadioBrowser(req: RadioBrowserRequest, res: RadioBrowserResponse, route: RadioBrowserRoute) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Метод не поддерживается");
  }

  const incoming = new URL(req.url ?? "/", "http://localhost");
  const query = new URLSearchParams(incoming.searchParams);
  let endpoint: string;

  if (route === "click") {
    const ids = query.getAll("uuid");
    if (ids.length !== 1 || !/^[0-9a-f-]{20,}$/i.test(ids[0])) return fail(res, 400, "Некорректный идентификатор станции");
    if ([...query.keys()].some((key) => key !== "uuid")) return fail(res, 400, "Параметр запроса не поддерживается");
    endpoint = `json/url/${ids[0]}`;
    query.delete("uuid");
  } else {
    endpoint = ROUTES[route];
  }

  const allowedQuery = route === "search" ? SEARCH_QUERY : route === "click" ? new Set<string>() : LIST_QUERY;
  const entries = [...query.entries()];
  if (entries.length > 16) return fail(res, 400, "Слишком много параметров запроса");
  const seen = new Set<string>();
  for (const [key, value] of entries) {
    if (!allowedQuery.has(key) || seen.has(key)) return fail(res, 400, "Параметр запроса не поддерживается");
    if (value.length > 200) return fail(res, 400, "Слишком длинное значение параметра");
    if (key === "limit" && (!/^\d+$/.test(value) || Number(value) > 1_000)) return fail(res, 400, "Некорректное значение limit");
    if (key === "offset" && (!/^\d+$/.test(value) || Number(value) > 1_000_000)) return fail(res, 400, "Некорректное значение offset");
    seen.add(key);
  }

  res.setHeader("Cache-Control", "no-store");
  for (const upstream of UPSTREAMS) {
    try {
      const url = new URL(endpoint, `${upstream}/`);
      url.search = query.toString();
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "PocketRadio/1.0 (radio discovery)",
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const payload: unknown = await response.json();
      res.setHeader("Cache-Control", route === "click" ? "no-store" : "public, s-maxage=30, stale-while-revalidate=120");
      return res.status(200).json(payload);
    } catch {
      // Try the next Radio Browser mirror when this one is unavailable or returns invalid JSON.
    }
  }

  return fail(res, 502, "Каталог Radio Browser временно недоступен. Попробуйте ещё раз позже.");
}
