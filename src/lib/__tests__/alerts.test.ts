import { describe, expect, it } from "vitest";
import { describeAlert, isDynamic, isTriggered, thresholdFor } from "../alerts";

describe("alerts", () => {
  it("fires on the right side of the threshold, inclusive", () => {
    expect(isTriggered("ABOVE", 10, 10)).toBe(true);
    expect(isTriggered("ABOVE", 9.99, 10)).toBe(false);
    expect(isTriggered("BELOW", 10, 10)).toBe(true);
    expect(isTriggered("BELOW", 10.01, 10)).toBe(false);
    expect(isTriggered("BELOW_BAZIN", 50, 60)).toBe(true);
  });
  it("never fires without a usable threshold or price", () => {
    expect(isTriggered("BELOW", 5, undefined)).toBe(false);
    expect(isTriggered("ABOVE", NaN, 10)).toBe(false);
  });
  it("derives Bazin and Graham thresholds from fundamentals", () => {
    expect(thresholdFor("BELOW_BAZIN", null, { dividendRate: 3 })).toBeCloseTo(50, 6); // 3 / 0.06
    expect(thresholdFor("BELOW_GRAHAM", null, { eps: 5, bookValuePerShare: 30 })).toBeCloseTo(58.09, 2);
    expect(thresholdFor("BELOW_GRAHAM", null, { eps: -1, bookValuePerShare: 30 })).toBeUndefined();
    expect(thresholdFor("BELOW_BAZIN", null, null)).toBeUndefined();
    expect(thresholdFor("ABOVE", 12, null)).toBe(12);
    expect(thresholdFor("ABOVE", null, null)).toBeUndefined();
  });
  it("flags dynamic types and describes", () => {
    expect(isDynamic("BELOW_BAZIN")).toBe(true);
    expect(isDynamic("ABOVE")).toBe(false);
    expect(describeAlert("ABOVE", 10, (n) => `R$ ${n}`)).toBe("subir até R$ 10");
  });
});
