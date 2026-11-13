import { describe, expect, it } from "vitest";
import { computePosition, findOversell, valuePosition } from "../portfolio";
import { bazinCeiling, grahamValue, marginOfSafety, momentum, rsi, valuation } from "../indicators";

describe("computePosition", () => {
  it("weighted average with fees and partial sale", () => {
    const p = computePosition([
      { type: "BUY", quantity: 100, price: 10, fees: 10, date: "2026-01-01" },
      { type: "BUY", quantity: 100, price: 20, fees: 0, date: "2026-02-01" },
      { type: "SELL", quantity: 50, price: 25, fees: 5, date: "2026-03-01" },
    ]);
    expect(p.avgPrice).toBeCloseTo(15.05, 6); // (1010 + 2000) / 200
    expect(p.quantity).toBe(150);
    expect(p.realizedPnl).toBeCloseTo(50 * (25 - 15.05) - 5, 6);
  });

  it("resets average after full sale", () => {
    const p = computePosition([
      { type: "BUY", quantity: 1, price: 100, date: "2026-01-01" },
      { type: "SELL", quantity: 1, price: 150, date: "2026-01-02" },
      { type: "BUY", quantity: 2, price: 80, date: "2026-01-03" },
    ]);
    expect(p.quantity).toBe(2);
    expect(p.avgPrice).toBe(80);
    expect(p.realizedPnl).toBe(50);
  });

  it("values in BRL", () => {
    const v = valuePosition({ quantity: 10, avgPrice: 100, cost: 1000, realizedPnl: 0, invested: 1000 }, 120, 5);
    expect(v.marketValueBrl).toBe(6000);
    expect(v.unrealizedPct).toBeCloseTo(20);
  });
});

describe("indicators", () => {
  it("Graham", () => {
    expect(grahamValue(5, 30)).toBeCloseTo(58.09, 2);
    expect(grahamValue(-1, 30)).toBeUndefined();
  });
  it("Bazin", () => {
    expect(bazinCeiling(3)).toBeCloseTo(50);
  });
  it("margin of safety", () => {
    expect(marginOfSafety(50, 40)).toBeCloseTo(0.2);
  });
  it("RSI of a monotonic rise is 100", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => i + 1))).toBe(100);
  });
  it("momentum returns", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i);
    const m = momentum(closes);
    expect(m.return30d).toBeCloseTo(399 / 378 - 1, 6);
    expect(m.sma200).toBeDefined();
  });
  it("valuation scores a cheap stock positively", () => {
    const v = valuation({ price: 30, eps: 5, bookValuePerShare: 30, pe: 6, pb: 1, dividendRate: 3, roe: 0.18, debtToEquity: 50, currentRatio: 2 });
    expect(v.score).toBeGreaterThan(50);
    expect(v.grahamCriteria.every((c) => c.ok)).toBe(true);
  });
});

describe("findOversell", () => {
  const b = (date: string, quantity: number) => ({ type: "BUY", quantity, price: 1, date });
  const s = (date: string, quantity: number) => ({ type: "SELL", quantity, price: 1, date });
  it("accepts a consistent history, including buy and sell on the same day", () => {
    expect(findOversell([b("2026-01-01", 10), s("2026-02-01", 10)])).toBeNull();
    expect(findOversell([s("2026-01-01", 5), b("2026-01-01", 5)])).toBeNull();
  });
  it("flags a sale larger than the position on its date, even if later buys cover it", () => {
    expect(findOversell([b("2026-03-01", 10), s("2026-02-01", 5)])).toBe("2026-02-01");
    expect(findOversell([b("2026-01-01", 10), s("2026-02-01", 11)])).toBe("2026-02-01");
  });
  it("catches an edit that moves a buy after its sale", () => {
    expect(findOversell([b("2026-02-10", 10), s("2026-02-01", 10)])).toBe("2026-02-01");
  });
});
