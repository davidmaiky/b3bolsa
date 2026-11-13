import { describe, expect, it } from "vitest";
import { computeTax, darfDue, type TaxAsset } from "../tax";

const stock = (ticker: string, txs: TaxAsset["txs"], assetClass: TaxAsset["assetClass"] = "B3", currency = "BRL"): TaxAsset => ({ ticker, assetClass, currency, txs });
const buy = (date: string, quantity: number, price: number, fees = 0) => ({ type: "BUY", quantity, price, fees, date });
const sell = (date: string, quantity: number, price: number, fees = 0) => ({ type: "SELL", quantity, price, fees, date });

describe("darfDue", () => {
  it("is the last business day of the following month", () => {
    expect(darfDue("2026-01")).toBe("2026-02-27"); // Feb 28 is a Saturday
    expect(darfDue("2026-03")).toBe("2026-04-30");
    expect(darfDue("2026-12")).toBe("2027-01-29"); // Jan 31 is a Sunday
  });
});

describe("ações (B3)", () => {
  it("gain is exempt when the month's sales are up to R$ 20 mil", () => {
    const r = computeTax([stock("AAAA3", [buy("2026-01-05", 100, 90), sell("2026-02-10", 100, 100)])], []);
    expect(r.months).toHaveLength(1);
    expect(r.months[0]).toMatchObject({ month: "2026-02", sales: 10000, gain: 1000, exempt: true, tax: 0 });
  });

  it("taxes 15% above the limit, after offsetting carried losses", () => {
    const r = computeTax(
      [
        stock("AAAA3", [buy("2026-01-02", 1000, 40), sell("2026-02-10", 1000, 38)]), // sales 38k, loss 2k
        stock("BBBB3", [buy("2026-01-02", 1000, 25), sell("2026-03-10", 1000, 30)]), // sales 30k, gain 5k
      ],
      [],
    );
    const [feb, mar] = r.months;
    expect(feb).toMatchObject({ month: "2026-02", gain: -2000, carryOut: 2000, tax: 0 });
    expect(mar).toMatchObject({ month: "2026-03", gain: 5000, lossUsed: 2000, taxable: 3000, carryOut: 0 });
    expect(mar.tax).toBeCloseTo(450, 6);
    expect(mar.due).toBe("2026-04-30");
  });

  it("uses weighted average cost including fees", () => {
    const r = computeTax([stock("AAAA3", [buy("2026-01-02", 100, 10, 10), buy("2026-01-03", 100, 20), sell("2026-02-02", 100, 30)])], []);
    expect(r.sales[0].costBrl).toBeCloseTo(1505, 6); // (1010 + 2000) / 200 × 100
    expect(r.sales[0].gainBrl).toBeCloseTo(3000 - 1505, 6);
  });
});

describe("FII/ETF and cripto", () => {
  it("FII: 20% and no exemption", () => {
    const r = computeTax([stock("HGLG11", [buy("2026-01-02", 100, 100), sell("2026-02-02", 100, 110)])], []);
    expect(r.months[0]).toMatchObject({ category: "FII", exempt: false, gain: 1000 });
    expect(r.months[0].tax).toBeCloseTo(200, 6);
    expect(r.warnings.join()).toContain("HGLG11");
  });

  it("cripto: exempt up to R$ 35 mil in sales, 15% above", () => {
    const fx = [{ date: "2026-01-01", close: 5 }];
    const small = computeTax([stock("BTC", [buy("2026-01-02", 1, 1000), sell("2026-02-02", 1, 3000)], "CRYPTO", "USD")], fx); // sales 15k
    expect(small.months[0]).toMatchObject({ exempt: true, tax: 0 });
    const big = computeTax([stock("BTC", [buy("2026-01-02", 1, 2000), sell("2026-02-02", 1, 10000)], "CRYPTO", "USD")], fx); // sales 50k, cost 10k
    expect(big.months[0].gain).toBeCloseTo(40000, 6);
    expect(big.months[0].tax).toBeCloseTo(6000, 6);
  });
});

describe("exterior", () => {
  it("annual 15% on BRL gain using each day's dollar", () => {
    const fx = [{ date: "2026-01-01", close: 5 }, { date: "2026-03-01", close: 6 }];
    const r = computeTax([stock("AAPL", [buy("2026-01-02", 10, 100), sell("2026-03-02", 10, 120)], "US", "USD")], fx);
    expect(r.sales[0]).toMatchObject({ grossBrl: 7200, costBrl: 5000 });
    expect(r.years).toEqual([{ year: 2026, gain: 2200, loss: 0, net: 2200, tax: expect.closeTo(330, 6) }]);
  });
  it("throws without dollar history", () => {
    expect(() => computeTax([stock("AAPL", [buy("2026-01-02", 1, 1)], "US", "USD")], [])).toThrow();
  });
});

describe("holdingsAt and day trade", () => {
  it("reports position and cost at a date", () => {
    const r = computeTax([stock("AAAA3", [buy("2026-01-02", 100, 10), sell("2026-02-02", 40, 12), buy("2027-01-05", 10, 20)])], []);
    const h = r.holdingsAt("2026-12-31");
    expect(h).toHaveLength(1);
    expect(h[0].quantity).toBe(60);
    expect(h[0].costBrl).toBeCloseTo(600, 6);
  });
  it("warns about same-day buy and sell", () => {
    const r = computeTax([stock("AAAA3", [buy("2026-01-02", 100, 10), sell("2026-01-02", 100, 11)])], []);
    expect(r.warnings.join()).toContain("mesmo dia");
  });
});
