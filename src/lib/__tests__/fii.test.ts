import { describe, expect, it } from "vitest";
import { fiiMetrics } from "../fii";

const now = new Date("2026-11-15");
const monthly = (n: number, amount: (i: number) => number, endMonth = "2026-11") => {
  const [y, m] = endMonth.split("-").map(Number);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - k), 10));
    return { date: d.toISOString().slice(0, 10), amount: amount(k) };
  });
};

describe("fiiMetrics", () => {
  it("computes P/VP, discount and monthly/annual yield", () => {
    const m = fiiMetrics({ price: 100, vpa: 125, dividends: monthly(12, () => 1), now });
    expect(m.pvp).toBeCloseTo(0.8, 6);
    expect(m.discountPct).toBeCloseTo(-20, 6);
    expect(m.dyMonthlyLastPct).toBeCloseTo(1, 6);
    expect(m.dyMonthlyAvgPct).toBeCloseTo(1, 6);
    expect(m.dy12mPct).toBeCloseTo(12, 6);
    expect(m.paymentMonths12).toBe(12);
    expect(m.dividendTrendPct).toBeCloseTo(0, 6);
  });

  it("detects irregular payments and falling dividends", () => {
    const divs = monthly(12, (i) => (i < 9 ? 1 : 0.8)).filter((_, i) => i !== 4);
    const m = fiiMetrics({ price: 100, vpa: 90, dividends: divs, now });
    expect(m.paymentMonths12).toBe(11);
    expect(m.dividendTrendPct!).toBeLessThan(-5);
    expect(m.signals.find((s) => s.label.startsWith("Rendimento pago"))!.ok).toBe(false);
  });

  it("uses the manual vacancy and marks missing data as unknown", () => {
    const base = { price: 100, vpa: 100, dividends: monthly(12, () => 1), now };
    const without = fiiMetrics(base);
    expect(without.signals.at(-1)!.ok).toBeNull();
    const low = fiiMetrics({ ...base, vacancyPhysical: 3 });
    const high = fiiMetrics({ ...base, vacancyPhysical: 25 });
    expect(low.signals.at(-1)!.ok).toBe(true);
    expect(high.signals.at(-1)!.ok).toBe(false);
    expect(low.score).toBeGreaterThan(without.score);
    expect(high.score).toBeLessThan(without.score);
  });

  it("is safe without price or dividends", () => {
    const m = fiiMetrics({ dividends: [], now });
    expect(m.pvp).toBeUndefined();
    expect(m.paymentMonths12).toBe(0);
    expect(m.score).toBe(0);
    expect(m.signals.every((s) => s.ok === null)).toBe(true);
  });

  it("scores a cheap, steady payer higher than an expensive one", () => {
    const cheap = fiiMetrics({ price: 90, vpa: 100, dividends: monthly(12, () => 1.1), vacancyPhysical: 4, now });
    const dear = fiiMetrics({ price: 130, vpa: 100, dividends: monthly(12, () => 0.6), vacancyPhysical: 22, now });
    expect(cheap.score).toBeGreaterThan(50);
    expect(dear.score).toBeLessThan(-20);
  });
});
