import { describe, expect, it } from "vitest";
import { rebalance } from "../rebalance";

const by = (rows: ReturnType<typeof rebalance>) => Object.fromEntries(rows.map((r) => [r.assetClass, r]));

describe("rebalance", () => {
  it("shows deviation and the trade needed to hit the targets", () => {
    const r = by(rebalance({ B3: 7000, US: 3000 }, { B3: 50, US: 50 }));
    expect(r.B3.currentPct).toBeCloseTo(70, 6);
    expect(r.B3.deviationPp).toBeCloseTo(20, 6);
    expect(r.B3.diffToTarget).toBeCloseTo(-2000, 6); // vender
    expect(r.US.diffToTarget).toBeCloseTo(2000, 6); // comprar
  });

  it("sends a contribution only to underweight classes, never selling", () => {
    const rows = rebalance({ B3: 7000, US: 3000 }, { B3: 50, US: 50 }, 1000);
    const r = by(rows);
    expect(r.US.contribution).toBeCloseTo(1000, 6); // B3 já está acima da meta mesmo após o aporte
    expect(r.B3.contribution).toBe(0);
    expect(r.US.afterPct).toBeCloseTo((4000 / 11000) * 100, 6);
    expect(rows.reduce((s, x) => s + x.contribution, 0)).toBeCloseTo(1000, 6);
  });

  it("splits a large contribution proportionally to each gap", () => {
    const r = by(rebalance({ B3: 5000, US: 3000, CRYPTO: 2000 }, { B3: 40, US: 40, CRYPTO: 20 }, 10000));
    // after = 20000 → ideal B3 8000 (+3000), US 8000 (+5000), CRYPTO 4000 (+2000): soma exata = aporte
    expect(r.B3.contribution).toBeCloseTo(3000, 6);
    expect(r.US.contribution).toBeCloseTo(5000, 6);
    expect(r.CRYPTO.contribution).toBeCloseTo(2000, 6);
  });

  it("handles an empty portfolio and classes without a target", () => {
    const empty = by(rebalance({}, { B3: 60, US: 40 }, 1000));
    expect(empty.B3.contribution).toBeCloseTo(600, 6);
    expect(empty.US.contribution).toBeCloseTo(400, 6);
    const orphan = by(rebalance({ FX: 1000, B3: 1000 }, { B3: 100 }));
    expect(orphan.FX.targetPct).toBe(0);
    expect(orphan.FX.diffToTarget).toBeCloseTo(-1000, 6);
  });
});
