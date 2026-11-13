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

import { businessDaysBetween, netValue, type Terms } from "../fixed-income";

describe("renda fixa na evolução", () => {
  const cdb: Terms = { kind: "CDB", indexer: "PRE", rate: 12, principal: 10_000, startDate: "2026-01-05", maturityDate: "2027-01-05" };

  it("works with fixed income only: money in on the start date, net value accrues daily", () => {
    const ev = computeEvolution({ assets: [], fx: [], end: "2026-03-02", fixed: [{ terms: cdb, label: "CDB A" }] });
    const p = ev.points;
    expect(p[0].date).toBe("2026-01-05");
    expect(p[0].holdings).toBe(10_000);
    expect(p[0].invested).toBe(10_000);
    const last = p.at(-1)!;
    const du = businessDaysBetween(cdb.startDate, "2026-03-02");
    const gross = 10_000 * Math.pow(1.12, du / 252);
    const net = netValue("CDB", 10_000, gross, cdb.startDate, "2026-03-02", cdb.maturityDate).net;
    expect(last.rf).toBeCloseTo(net, 6);
    expect(last.holdings).toBeCloseTo(net, 6);
    expect(last.invested).toBe(10_000); // só o aporte; o rendimento não é aporte
    expect(last.rfTwr!).toBeGreaterThan(100);
    expect(last.rfTwr!).toBeCloseTo((net / 10_000) * 100, 1); // sem aportes extras, o índice acompanha o saldo
  });

  it("a redemption takes the value out and counts as cash out, not as a loss", () => {
    const ev = computeEvolution({ assets: [], fx: [], end: "2026-04-10", fixed: [{ terms: cdb, label: "CDB A", redeemedAt: "2026-03-02", redeemedNet: 10_150 }] });
    const day = (d: string) => ev.points.find((x) => x.date === d)!;
    expect(day("2026-03-02").holdings).toBe(0);
    expect(day("2026-03-02").invested).toBeCloseTo(10_000 - 10_150, 6);
    expect(day("2026-04-10").rf).toBe(0);
    expect(day("2026-03-01").rf).toBeGreaterThan(10_000);
    // o índice não despenca no dia do resgate: o dinheiro saiu, não foi perdido
    expect(day("2026-03-02").rfTwr!).toBeGreaterThan(day("2026-02-27").rfTwr! * 0.99);
  });

  it("adds to stocks, and a second deposit does not count as performance", () => {
    const stock = { ref: { ticker: "AAA", assetClass: "B3" as const, currency: "BRL" }, txs: [{ type: "BUY", quantity: 10, price: 10, date: "2026-01-05" }], closes: [{ date: "2026-01-05", close: 10 }, { date: "2026-01-06", close: 11 }], divs: [] };
    const second: Terms = { ...cdb, startDate: "2026-02-02", principal: 20_000 };
    const ev = computeEvolution({ assets: [stock], fx: [], end: "2026-02-03", fixed: [{ terms: cdb, label: "A" }, { terms: second, label: "B" }] });
    const d = (x: string) => ev.points.find((p) => p.date === x)!;
    expect(d("2026-02-02").invested).toBeCloseTo(100 + 10_000 + 20_000, 6);
    expect(d("2026-02-03").holdings).toBeGreaterThan(d("2026-02-02").holdings);
    // a entrada de 20 mil em 02/02 não vira "ganho": o índice sobe só pelo rendimento do dia
    expect(d("2026-02-02").rfTwr! / d("2026-01-30").rfTwr!).toBeLessThan(1.01);
  });

  it("warns and keeps the principal when a CDI contract has no CDI data", () => {
    const ev = computeEvolution({ assets: [], fx: [], end: "2026-02-10", fixed: [{ terms: { ...cdb, indexer: "CDI_PCT", rate: 110 }, label: "CDB B" }], rates: {} });
    expect(ev.points.at(-1)!.rf).toBe(10_000);
    expect(ev.warnings.join()).toContain("CDB B");
  });
});
