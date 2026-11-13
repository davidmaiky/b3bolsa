import { describe, expect, it } from "vitest";
import { businessDaysBetween, calendarDays, describeRate, grossValue, iofRate, irRate, isBusinessDay, netValue, valueOf, type Terms } from "../fixed-income";

const base: Terms = { kind: "CDB", indexer: "PRE", rate: 12, principal: 10_000, startDate: "2026-01-05", maturityDate: "2027-01-05" };
const cdiFlat = (from: string, to: string, v: number) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(+d + 86_400_000)) {
    const s = d.toISOString().slice(0, 10);
    if (isBusinessDay(s)) out.push({ date: s, close: v });
  }
  return out;
};

describe("calendário", () => {
  it("weekends and national holidays are not business days", () => {
    expect(isBusinessDay("2026-01-03")).toBe(false); // sábado
    expect(isBusinessDay("2026-01-01")).toBe(false);
    expect(isBusinessDay("2026-02-17")).toBe(false); // Carnaval 2026 (terça)
    expect(isBusinessDay("2026-04-03")).toBe(false); // Sexta-feira Santa 2026
    expect(isBusinessDay("2026-06-04")).toBe(false); // Corpus Christi 2026
    expect(isBusinessDay("2026-11-20")).toBe(false); // Consciência Negra
    expect(isBusinessDay("2026-01-05")).toBe(true);
  });
  it("counts business days in (from, to]", () => {
    expect(businessDaysBetween("2026-01-05", "2026-01-09")).toBe(4); // ter..sex
    expect(businessDaysBetween("2026-01-09", "2026-01-12")).toBe(1); // só a segunda
    expect(businessDaysBetween("2026-01-05", "2026-01-05")).toBe(0);
    expect(calendarDays("2026-01-01", "2026-03-01")).toBe(59);
  });
});

describe("rendimento bruto", () => {
  it("prefixado: (1+r)^(du/252)", () => {
    const du = businessDaysBetween(base.startDate, "2026-07-01");
    expect(grossValue(base, "2026-07-01", null)).toBeCloseTo(10_000 * Math.pow(1.12, du / 252), 6);
  });
  it("is the principal before the start and stops accruing at maturity", () => {
    expect(grossValue(base, "2026-01-05", null)).toBe(10_000);
    expect(grossValue(base, "2026-01-01", null)).toBe(10_000);
    expect(grossValue(base, "2027-01-05", null)).toBeCloseTo(grossValue(base, "2030-01-01", null)!, 8);
  });
  it("% do CDI compounds the daily rate × percentage", () => {
    const t: Terms = { ...base, indexer: "CDI_PCT", rate: 110, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-03-31", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-03-31");
    expect(grossValue(t, "2026-03-31", cdi)).toBeCloseTo(10_000 * Math.pow(1 + 0.0005 * 1.1, du), 6);
  });
  it("days newer than the last published CDI reuse the last rate", () => {
    const t: Terms = { ...base, indexer: "CDI_PCT", rate: 100, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-01-30", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-02-13");
    expect(grossValue(t, "2026-02-13", cdi)).toBeCloseTo(10_000 * Math.pow(1.0005, du), 6);
  });
  it("CDI + taxa adds the annual spread on top of the CDI", () => {
    const t: Terms = { ...base, indexer: "CDI_PLUS", rate: 2.5, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-03-31", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-03-31");
    expect(grossValue(t, "2026-03-31", cdi)).toBeCloseTo(10_000 * Math.pow(1.0005 * Math.pow(1.025, 1 / 252), du), 6);
  });
  it("CDI contracts without CDI data cannot be valued", () => {
    expect(grossValue({ ...base, indexer: "CDI_PCT", rate: 100 }, "2026-06-01", null)).toBeNull();
    expect(grossValue({ ...base, indexer: "CDI_PCT", rate: 100 }, "2026-06-01", [])).toBeNull();
  });
});

describe("impostos", () => {
  it("IR regressivo por faixa e IOF nos primeiros 30 dias", () => {
    expect(irRate(180)).toBe(0.225);
    expect(irRate(181)).toBe(0.2);
    expect(irRate(361)).toBe(0.175);
    expect(irRate(721)).toBe(0.15);
    expect(iofRate(1)).toBe(0.96);
    expect(iofRate(29)).toBe(0.03);
    expect(iofRate(30)).toBe(0);
  });
  it("CDB: IR sobre o rendimento; LCI/LCA isentos", () => {
    const cdb = netValue("CDB", 10_000, 10_600, "2025-01-01", "2026-06-01", "2027-01-01"); // 516 dias → 17,5%
    expect(cdb.irRate).toBe(0.175);
    expect(cdb.ir).toBeCloseTo(105, 6);
    expect(cdb.net).toBeCloseTo(10_495, 6);
    const lci = netValue("LCI", 10_000, 10_600, "2025-01-01", "2026-06-01", "2027-01-01");
    expect(lci.ir).toBe(0);
    expect(lci.net).toBe(10_600);
  });
  it("IOF reduces the base of the IR in the first days; no negative tax on losses", () => {
    const n = netValue("CDB", 10_000, 10_010, "2026-01-05", "2026-01-15", "2027-01-05"); // 10 dias: IOF 66%
    expect(n.iof).toBeCloseTo(6.6, 6);
    expect(n.ir).toBeCloseTo((10 - 6.6) * 0.225, 6);
    expect(netValue("CDB", 10_000, 9_990, "2026-01-05", "2026-06-01", "2027-01-05").ir).toBe(0);
  });
});

describe("valueOf", () => {
  it("combines accrual and tax, flags maturity", () => {
    const v = valueOf({ ...base, maturityDate: "2026-07-01" }, "2026-08-01", null)!;
    expect(v.matured).toBe(true);
    expect(v.daysToMaturity).toBeLessThan(0);
    expect(v.net).toBeGreaterThan(10_000);
    expect(v.net).toBeLessThan(v.gross);
    expect(describeRate("CDI_PCT", 110)).toBe("110% do CDI");
  });
});
