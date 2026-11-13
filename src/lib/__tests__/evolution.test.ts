import { describe, expect, it } from "vitest";
import { computeEvolution, cumulativeFromRates, dateRange, forwardFill } from "../evolution";

const ref = { ticker: "AAA", assetClass: "B3" as const, currency: "BRL" };

describe("evolution helpers", () => {
  it("dateRange and forwardFill", () => {
    expect(dateRange("2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
    const f = forwardFill([{ date: "2026-01-31", close: 5 }, { date: "2026-02-02", close: 7 }], dateRange("2026-01-30", "2026-02-02"));
    expect(f).toEqual([null, 5, 5, 7]);
  });
  it("CDI compounds daily rates after the start date", () => {
    const idx = cumulativeFromRates([{ date: "2026-01-01", close: 5 }, { date: "2026-01-02", close: 1 }, { date: "2026-01-03", close: 1 }], dateRange("2026-01-01", "2026-01-03"));
    expect(idx[0]).toBe(100);
    expect(idx[1]).toBeCloseTo(101, 6);
    expect(idx[2]).toBeCloseTo(102.01, 6);
  });
});

describe("computeEvolution", () => {
  const closes = [
    { date: "2026-01-01", close: 10 },
    { date: "2026-01-02", close: 11 },
    { date: "2026-01-03", close: 11 },
    { date: "2026-01-04", close: 12.1 },
  ];
  const txs = [
    { type: "BUY", quantity: 10, price: 10, date: "2026-01-01" },
    { type: "BUY", quantity: 10, price: 11, date: "2026-01-03" },
  ];

  it("time-weighted return ignores deposits; invested tracks net flows", () => {
    const ev = computeEvolution({ assets: [{ ref, txs, closes, divs: [] }], fx: [], end: "2026-01-04" });
    const p = ev.points;
    expect(p.map((x) => x.holdings)).toEqual([100, 110, 220, 242]);
    expect(p.map((x) => x.invested)).toEqual([100, 100, 210, 210]);
    expect(p[1].twr).toBeCloseTo(110, 6);
    expect(p[2].twr).toBeCloseTo(110, 6); // buying 110 more at the close price adds no performance
    expect(p[3].twr).toBeCloseTo(121, 6); // +10% on the doubled position
  });

  it("dividends lift the total-return index but not the price index", () => {
    const ev = computeEvolution({ assets: [{ ref, txs: [txs[0]], closes, divs: [{ date: "2026-01-04", net: 10 }] }], fx: [], end: "2026-01-04" });
    const last = ev.points[3];
    expect(last.dividends).toBe(10);
    expect(last.twr).toBeCloseTo(121, 6);
    expect(last.twrTotal).toBeGreaterThan(last.twr);
    expect(last.twrTotal).toBeCloseTo(131, 6); // 121 in holdings + 10 received, on a base of 100
  });

  it("converts USD assets with the historical rate and falls back to trade price without history", () => {
    const usd = { ticker: "BBB", assetClass: "US" as const, currency: "USD" };
    const fx = dateRange("2026-01-01", "2026-01-02").map((date, i) => ({ date, close: 5 + i }));
    const ev = computeEvolution({
      assets: [{ ref: usd, txs: [{ type: "BUY", quantity: 2, price: 100, date: "2026-01-01" }], closes: [], divs: [] }],
      fx,
      end: "2026-01-02",
    });
    expect(ev.points.map((x) => x.holdings)).toEqual([1000, 1200]); // 2 × 100 × fx
    expect(ev.missing).toEqual(["BBB"]);
  });

  it("throws when USD is held but there is no fx history", () => {
    const usd = { ticker: "BBB", assetClass: "US" as const, currency: "USD" };
    expect(() => computeEvolution({ assets: [{ ref: usd, txs: [{ type: "BUY", quantity: 1, price: 1, date: "2026-01-01" }], closes: [], divs: [] }], fx: [], end: "2026-01-02" })).toThrow();
  });

  it("benchmarks are rebased to 100 and S&P is converted to BRL", () => {
    const ev = computeEvolution({
      assets: [{ ref, txs: [txs[0]], closes, divs: [] }],
      fx: dateRange("2026-01-01", "2026-01-04").map((date) => ({ date, close: 5 })),
      end: "2026-01-04",
      ibov: [{ date: "2026-01-01", close: 100000 }, { date: "2026-01-04", close: 110000 }],
      sp500Usd: [{ date: "2026-01-01", close: 5000 }, { date: "2026-01-04", close: 5500 }],
    });
    expect(ev.points[0].ibov).toBe(100);
    expect(ev.points[3].ibov).toBeCloseTo(110, 6);
    expect(ev.points[3].sp500).toBeCloseTo(110, 6);
  });
});
