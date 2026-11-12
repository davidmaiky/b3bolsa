const BASE = "https://download.londonstrategicedge.com/v3";

export class LseError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export function lseKey(): string | null {
  return process.env.LSE_API_KEY?.trim() || null;
}

/** GET /v3/<path>. Key always in the X-API-Key header, never in the URL. */
export async function lseGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const key = lseKey();
  if (!key) throw new LseError(401, "key-missing", "Configure LSE_API_KEY no arquivo .env");
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}/${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { "X-API-Key": key },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LseError(res.status, body.code ?? "error", body.message ?? res.statusText, body.retry_after);
  }
  return body as T;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Newest ten candles, or the candles between from/to (short windows). */
export async function lsePreview(
  market: string,
  symbol: string,
  timeframe = "1d",
  range?: { from: string; to: string },
): Promise<Candle[]> {
  const r = await lseGet<{ rows: Candle[] }>("preview", {
    market,
    symbol,
    timeframe,
    ...(range ?? {}),
  });
  return r.rows ?? [];
}

export interface LsePair {
  symbol: string;
  name: string;
  pair_id: number;
  folder?: string;
}

export async function lseSearch(q: string, market?: string): Promise<LsePair[]> {
  const r = await lseGet<{ pairs: LsePair[] }>("pairs", { q, limit: 15, ...(market ? { market } : {}) });
  return r.pairs ?? [];
}

export async function lseUsage() {
  return lseGet<Record<string, unknown>>("usage");
}
