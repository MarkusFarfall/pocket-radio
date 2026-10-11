import type { IncomingMessage, ServerResponse } from "node:http";

interface VercelRequest extends IncomingMessage {}
interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

const UPSTREAMS = ["https://all.api.radio-browser.info", "https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://de2.api.radio-browser.info"];

function fail(res: VercelResponse, status: number, error: string) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error });
}

/** Same-origin proxy for Radio Browser click counts. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Метод не поддерживается");
  }

  const query = new URL(req.url ?? "/", "http://localhost").searchParams;
  const ids = query.getAll("uuid");
  if (ids.length !== 1 || !/^[0-9a-f-]{20,}$/i.test(ids[0])) return fail(res, 400, "Некорректный идентификатор станции");
  if ([...query.keys()].some((key) => key !== "uuid")) return fail(res, 400, "Параметр запроса не поддерживается");

  res.setHeader("Cache-Control", "no-store");
  for (const upstream of UPSTREAMS) {
    try {
      const url = new URL(`json/url/${ids[0]}`, `${upstream}/`);
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "PocketRadio/1.0 (radio discovery)" },
        signal: AbortSignal.timeout(2_200),
      });
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      return res.status(200).json(payload);
    } catch {
      // Try the next mirror.
    }
  }
  return fail(res, 502, "Каталог Radio Browser временно недоступен. Попробуйте ещё раз позже.");
}
