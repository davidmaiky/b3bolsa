import { describe, expect, it } from "vitest";
import { makeToken, safeEqual, safeNext, verifyToken } from "../auth";
import { monthlyNet, netOf, netSince, quantityAt, yieldOnCost } from "../dividends";

describe("session token", () => {
  it("verifies a fresh token and rejects tampering, expiry and other secrets", async () => {
    const t = await makeToken("s3cret", 1_000, 60_000);
    expect(await verifyToken("s3cret", t, 2_000)).toBe(true);
    expect(await verifyToken("other", t, 2_000)).toBe(false);
    expect(await verifyToken("s3cret", t, 70_000)).toBe(false); // expired
    const [exp, sig] = t.split(".");
    expect(await verifyToken("s3cret", `${Number(exp) + 99_999}.${sig}`, 2_000)).toBe(false);
    expect(await verifyToken("s3cret", undefined)).toBe(false);
    expect(await verifyToken("s3cret", "garbage")).toBe(false);
  });
  it("safeEqual and safeNext", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeNext("/transacoes?x=1")).toBe("/transacoes?x=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("dividends", () => {
  const txs = [
    { type: "BUY", quantity: 100, price: 10, date: "2026-01-10" },
    { type: "BUY", quantity: 50, price: 12, date: "2026-03-01" },
    { type: "SELL", quantity: 30, price: 15, date: "2026-05-01" },
  ];
  it("quantityAt counts only trades before the ex-date", () => {
    expect(quantityAt(txs, "2026-01-10")).toBe(0);
    expect(quantityAt(txs, "2026-02-01")).toBe(100);
    expect(quantityAt(txs, "2026-04-01")).toBe(150);
    expect(quantityAt(txs, "2026-06-01")).toBe(120);
  });
  it("net amount, trailing window, yield on cost", () => {
    const jcp = { date: "2026-06-15", perShare: 1, quantity: 100, tax: 15 };
    expect(netOf(jcp)).toBe(85);
    const old = { date: "2025-01-01", perShare: 2, quantity: 100, tax: 0 };
    expect(netSince([jcp, old], new Date("2026-11-12"))).toBe(85);
    expect(yieldOnCost(85, 1000)).toBeCloseTo(8.5, 6);
    expect(yieldOnCost(85, 0)).toBeUndefined();
  });
  it("monthlyNet fills empty months and ignores older entries", () => {
    const m = monthlyNet([{ date: "2026-10-05", net: 10 }, { date: "2026-10-20", net: 5 }, { date: "2024-01-01", net: 99 }], 3, new Date("2026-11-12"));
    expect(m).toEqual([{ month: "2026-09", value: 0 }, { month: "2026-10", value: 15 }, { month: "2026-11", value: 0 }]);
  });
});
