import type { IncomingMessage, ServerResponse } from "node:http";

interface VercelRequest extends IncomingMessage {
  query?: { q?: string | string[] };
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

interface GardenPayload {
  hits?: { hits?: unknown[] };
}

/** Same-origin proxy for Radio Garden's unofficial, non-CORS search API. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const rawQuery = req.query?.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";
  if (!query) return res.status(400).json({ error: "Введите название станции или города" });
  if (query.length > 100) return res.status(400).json({ error: "Слишком длинный запрос (максимум 100 символов)" });

  try {
    const upstream = await fetch(`https://radio.garden/api/search?q=${encodeURIComponent(query)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PocketRadio/1.0 (radio discovery)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Radio Garden временно недоступен (HTTP ${upstream.status})` });
    }

    const payload = (await upstream.json()) as GardenPayload;
    if (!Array.isArray(payload.hits?.hits)) {
      return res.status(502).json({ error: "Radio Garden вернул неожиданный формат ответа" });
    }

    // Cache identical searches briefly at the Vercel edge to avoid repeated catalogue calls.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(payload);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return res.status(502).json({
      error: timedOut ? "Поиск Radio Garden превысил время ожидания" : "Не удалось связаться с Radio Garden",
    });
  }
}
