/** Resilient model calls: retry transient failures once, then fall back to the next model in the chain. */

export type Verdict = "retry" | "next" | "fatal";

const statusOf = (e: unknown): number | undefined => {
  const x = e as { status?: unknown; code?: unknown; message?: string };
  if (typeof x?.status === "number") return x.status;
  if (typeof x?.code === "number") return x.code;
  const m = /"code"\s*:\s*(\d{3})/.exec(x?.message ?? "");
  return m ? Number(m[1]) : undefined;
};

/**
 * 503/500/504 and timeouts: transient → retry the same model once.
 * 429 (quota/rate), 404 (model gone), 400 and unparsable output: this model won't work now → next model.
 * 401/403: the key is wrong or blocked, no other model will help → stop.
 */
export function classifyError(e: unknown): Verdict {
  const s = statusOf(e);
  if (s === 401 || s === 403) return "fatal";
  if (s === 429 || s === 404 || s === 400) return "next";
  if (s !== undefined && s >= 500) return "retry";
  const msg = (e as Error)?.message ?? "";
  if (/timeout|timed out|aborted|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)) return "retry";
  return "next"; // e.g. invalid JSON from the model
}

export interface Attempt { model: string; error: string }

export class AllModelsFailed extends Error {
  constructor(public attempts: Attempt[]) {
    super(`Nenhum modelo respondeu. ${attempts.map((a) => `${a.model}: ${a.error}`).join(" | ")}`);
  }
}

const brief = (e: unknown) => ((e as Error)?.message ?? String(e)).replace(/\s+/g, " ").slice(0, 160);

export async function runWithFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  opts: { retryDelayMs?: number } = {},
): Promise<{ result: T; model: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  for (const model of models) {
    for (let n = 0; n < 2; n++) {
      try {
        return { result: await call(model), model, attempts };
      } catch (e) {
        const verdict = classifyError(e);
        attempts.push({ model, error: brief(e) });
        if (verdict === "fatal") throw e;
        if (verdict === "next" || n === 1) break;
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000));
      }
    }
  }
  throw new AllModelsFailed(attempts);
}

/** Primary model first, then the configured/default fallbacks, without duplicates. */
export function modelChain(primary: string, fallbacksEnv?: string): string[] {
  const defaults = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
  const extra = fallbacksEnv?.trim() ? fallbacksEnv.split(",").map((s) => s.trim()).filter(Boolean) : defaults;
  return [...new Set([primary, ...extra])];
}
