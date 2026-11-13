import { describe, expect, it } from "vitest";
import { fixedIncomeTaxSummary, type FiTaxItem } from "../fixed-income-tax";
import { businessDaysBetween, netValue, type Terms } from "../fixed-income";

const pre = (kind: Terms["kind"], start: string, maturity: string, principal = 10_000): Terms => ({ kind, indexer: "PRE", rate: 12, principal, startDate: start, maturityDate: maturity });
const item = (id: string, terms: Terms, redeemedAt: string | null = null, redeemedNet: number | null = null): FiTaxItem => ({ id, label: id, issuer: "Banco", terms, redeemedAt, redeemedNet });

describe("fixedIncomeTaxSummary", () => {
  it("separates taxed (CDB) from exempt (LCI) redemptions of the year and estimates the IR withheld", () => {
    const cdb = pre("CDB", "2025-02-03", "2026-08-03");
    const lci = pre("LCI", "2025-02-03", "2026-08-03");
    const [y] = fixedIncomeTaxSummary([item("cdb", cdb, "2026-08-03", 10_900), item("lci", lci, "2026-08-03", 11_200), item("old", pre("CDB", "2024-01-02", "2025-01-02"), "2025-01-02", 10_900)], {}, [2026], "2026-11-13");
    expect(y.redemptions.map((r) => r.id)).toEqual(["cdb", "lci"]);
    expect(y.taxedYieldNet).toBeCloseTo(900, 6);
    expect(y.exemptYield).toBeCloseTo(1_200, 6);
    const du = businessDaysBetween(cdb.startDate, "2026-08-03");
    const gross = 10_000 * Math.pow(1.12, du / 252);
    expect(y.irWithheld).toBeCloseTo(netValue("CDB", 10_000, gross, cdb.startDate, "2026-08-03", cdb.maturityDate).ir, 6);
    expect(y.redemptions.find((r) => r.id === "lci")!.irWithheld).toBe(0);
  });

  it("holdings at year end include only open applications that had started by then", () => {
    const items = [
      item("open", pre("CDB", "2025-06-02", "2027-06-02")),
      item("redeemed-after", pre("CDB", "2025-06-02", "2026-06-02"), "2026-06-02", 10_700),
      item("redeemed-before", pre("CDB", "2025-01-02", "2025-11-03"), "2025-11-03", 10_900),
      item("future", pre("CDB", "2026-03-02", "2027-03-02")),
    ];
    const [y25, y26] = fixedIncomeTaxSummary(items, {}, [2025, 2026], "2026-11-13");
    expect(y25.holdingsDate).toBe("2025-12-31");
    expect(y25.holdings.map((h) => h.id).sort()).toEqual(["open", "redeemed-after"]);
    expect(y26.holdingsDate).toBe("2026-11-13"); // ano corrente: posição de hoje
    expect(y26.holdings.map((h) => h.id).sort()).toEqual(["future", "open"]);
    expect(y25.holdings.find((h) => h.id === "open")!.net!).toBeGreaterThan(10_000);
  });

  it("without market data the IR is unknown (null) and values are not invented", () => {
    const cdi: Terms = { ...pre("CDB", "2025-02-03", "2026-08-03"), indexer: "CDI_PCT", rate: 110 };
    const [y] = fixedIncomeTaxSummary([item("c", cdi, "2026-08-03", 10_800), item("o", { ...cdi, maturityDate: "2027-08-03" })], {}, [2026], "2026-11-13");
    expect(y.redemptions[0].irWithheld).toBeNull();
    expect(y.redemptions[0].yieldNet).toBeCloseTo(800, 6);
    expect(y.holdings[0].gross).toBeNull();
  });
});
