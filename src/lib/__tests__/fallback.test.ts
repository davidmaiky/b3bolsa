import { describe, expect, it } from "vitest";
import { AllModelsFailed, classifyError, modelChain, runWithFallback } from "../llm/fallback";

const err = (status: number, message = "boom") => Object.assign(new Error(message), { status });

describe("classifyError", () => {
  it("maps statuses to verdicts", () => {
    expect(classifyError(err(503))).toBe("retry");
    expect(classifyError(err(500))).toBe("retry");
    expect(classifyError(err(429))).toBe("next");
    expect(classifyError(err(404))).toBe("next");
    expect(classifyError(err(401))).toBe("fatal");
    expect(classifyError(err(403))).toBe("fatal");
    expect(classifyError(new Error('{"error":{"code":503,"message":"overloaded"}}'))).toBe("retry");
    expect(classifyError(new Error("request timed out"))).toBe("retry");
    expect(classifyError(new SyntaxError("Unexpected token"))).toBe("next");
  });
});

describe("runWithFallback", () => {
  const fast = { retryDelayMs: 0 };
  it("returns the first success and reports no attempts", async () => {
    const r = await runWithFallback(["a", "b"], async (m) => m.toUpperCase(), fast);
    expect(r).toEqual({ result: "A", model: "a", attempts: [] });
  });
  it("retries a transient 503 once on the same model", async () => {
    let n = 0;
    const r = await runWithFallback(["a", "b"], async (m) => { if (m === "a" && n++ === 0) throw err(503); return m; }, fast);
    expect(r.model).toBe("a");
    expect(r.attempts).toHaveLength(1);
  });
  it("jumps straight to the next model on 429", async () => {
    const calls: string[] = [];
    const r = await runWithFallback(["a", "b"], async (m) => { calls.push(m); if (m === "a") throw err(429, "quota"); return m; }, fast);
    expect(calls).toEqual(["a", "b"]);
    expect(r.model).toBe("b");
    expect(r.attempts[0].model).toBe("a");
  });
  it("gives up after a persistent 503 and moves on", async () => {
    const calls: string[] = [];
    const r = await runWithFallback(["a", "b"], async (m) => { calls.push(m); if (m === "a") throw err(503); return m; }, fast);
    expect(calls).toEqual(["a", "a", "b"]);
    expect(r.model).toBe("b");
  });
  it("stops immediately on auth errors and reports every attempt when all fail", async () => {
    await expect(runWithFallback(["a", "b"], async () => { throw err(403, "denied"); }, fast)).rejects.toThrow("denied");
    await expect(runWithFallback(["a", "b"], async () => { throw err(429); }, fast)).rejects.toBeInstanceOf(AllModelsFailed);
  });
});

describe("modelChain", () => {
  it("dedupes and honors the env override", () => {
    expect(modelChain("gemini-2.5-flash")).toEqual(["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]);
    expect(modelChain("p", "x, y,p")).toEqual(["p", "x", "y"]);
  });
});
