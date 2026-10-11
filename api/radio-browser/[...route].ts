import type { IncomingMessage, ServerResponse } from "node:http";

interface VercelRequest extends IncomingMessage {}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

const UPSTREAMS = [
  "https://all.api.radio-browser.info",
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
];
const UPSTREAM_TIMEOUT_MS = 2_200;
const API_PREFIX = "/api/radio-browser/";
const SEARCH_QUERY = new Set(["name", "tag", "countrycode", "language", "codec", "bitrateMin", "order", "reverse", "limit", "offset", "hidebroken", "is_https"]);
const LIST_QUERY = new Set(["order", "reverse", "limit", "hidebroken"]);

function fail(res: VercelResponse, status: number, error: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error });
}

/** Same-origin, allow-listed proxy for Radio Browser's JSON API. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Метод не поддерживается");
  }

  const incoming = new URL(req.url ?? "/", "http://localhost");
  if (!incoming.pathname.startsWith(API_PREFIX)) return fail(res, 404, "Маршрут не найден");

  const route = incoming.pathname.slice(API_PREFIX.length);
  const isSearch = route === "json/stations/search";
  const isList = ["json/tags", "json/countries", "json/languages"].includes(route);
  const isClick = /^json\/url\/[0-9a-f-]{20,}$/i.test(route);
  if (!isSearch && !isList && !isClick) return fail(res, 404, "Маршрут Radio Browser не найден");

  const allowedQuery = isSearch ? SEARCH_QUERY : isList ? LIST_QUERY : new Set<string>();
  const query = new URLSearchParams();
  if ([...incoming.searchParams].length > 16) return fail(res, 400, "Слишком много параметров запроса");
  for (const [key, value] of incoming.searchParams) {
    if (!allowedQuery.has(key)) return fail(res, 400, "Параметр запроса не поддерживается");
    if (value.length > 200) return fail(res, 400, "Слишком длинное значение параметра");
    if (key === "limit" && (!/^\d+$/.test(value) || Number(value) > 1_000)) return fail(res, 400, "Некорректное значение limit");
    if (key === "offset" && (!/^\d+$/.test(value) || Number(value) > 1_000_000)) return fail(res, 400, "Некорректное значение offset");
    query.append(key, value);
  }

  res.setHeader("Cache-Control", "no-store");
  for (const upstream of UPSTREAMS) {
    try {
      const url = new URL(route, `${upstream}/`);
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
      res.setHeader("Cache-Control", isClick ? "no-store" : "public, s-maxage=30, stale-while-revalidate=120");
      return res.status(200).json(payload);
    } catch {
      // Try the next Radio Browser mirror when this one is unavailable or returns invalid JSON.
    }
  }

  return fail(res, 502, "Каталог Radio Browser временно недоступен. Попробуйте ещё раз позже.");
}
