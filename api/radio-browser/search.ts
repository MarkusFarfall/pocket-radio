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
const ALLOWED_QUERY = new Set(["name", "tag", "countrycode", "language", "codec", "bitrateMin", "order", "reverse", "limit", "offset", "hidebroken", "is_https"]);

function fail(res: VercelResponse, status: number, error: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error });
}

/** Same-origin proxy for Radio Browser station searches. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Метод не поддерживается");
  }

  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  if ([...query].length > 16) return fail(res, 400, "Слишком много параметров запроса");
  const seen = new Set<string>();
  for (const [key, value] of query) {
    if (!ALLOWED_QUERY.has(key) || seen.has(key)) return fail(res, 400, "Параметр запроса не поддерживается");
    if (value.length > 200) return fail(res, 400, "Слишком длинное значение параметра");
    if (key === "limit" && (!/^\d+$/.test(value) || Number(value) > 1_000)) return fail(res, 400, "Некорректное значение limit");
    if (key === "offset" && (!/^\d+$/.test(value) || Number(value) > 1_000_000)) return fail(res, 400, "Некорректное значение offset");
    seen.add(key);
  }

  res.setHeader("Cache-Control", "no-store");
  for (const upstream of UPSTREAMS) {
    try {
      const url = new URL("json/stations/search", `${upstream}/`);
      url.search = query.toString();
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "PocketRadio/1.0 (radio discovery)" },
        signal: AbortSignal.timeout(2_200),
      });
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
      return res.status(200).json(payload);
    } catch {
      // Try the next mirror.
    }
  }
  return fail(res, 502, "Каталог Radio Browser временно недоступен. Попробуйте ещё раз позже.");
}
