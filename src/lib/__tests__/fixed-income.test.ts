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
    expect(grossValue(base, "2026-07-01", {})).toBeCloseTo(10_000 * Math.pow(1.12, du / 252), 6);
  });
  it("is the principal before the start and stops accruing at maturity", () => {
    expect(grossValue(base, "2026-01-05", {})).toBe(10_000);
    expect(grossValue(base, "2026-01-01", {})).toBe(10_000);
    expect(grossValue(base, "2027-01-05", {})).toBeCloseTo(grossValue(base, "2030-01-01", {})!, 8);
  });
  it("% do CDI compounds the daily rate × percentage", () => {
    const t: Terms = { ...base, indexer: "CDI_PCT", rate: 110, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-03-31", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-03-31");
    expect(grossValue(t, "2026-03-31", { cdi })).toBeCloseTo(10_000 * Math.pow(1 + 0.0005 * 1.1, du), 6);
  });
  it("days newer than the last published CDI reuse the last rate", () => {
    const t: Terms = { ...base, indexer: "CDI_PCT", rate: 100, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-01-30", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-02-13");
    expect(grossValue(t, "2026-02-13", { cdi })).toBeCloseTo(10_000 * Math.pow(1.0005, du), 6);
  });
  it("CDI + taxa adds the annual spread on top of the CDI", () => {
    const t: Terms = { ...base, indexer: "CDI_PLUS", rate: 2.5, maturityDate: "2026-12-31" };
    const cdi = cdiFlat("2026-01-01", "2026-03-31", 0.05);
    const du = businessDaysBetween("2026-01-05", "2026-03-31");
    expect(grossValue(t, "2026-03-31", { cdi })).toBeCloseTo(10_000 * Math.pow(1.0005 * Math.pow(1.025, 1 / 252), du), 6);
  });
  it("CDI contracts without CDI data cannot be valued", () => {
    expect(grossValue({ ...base, indexer: "CDI_PCT", rate: 100 }, "2026-06-01", {})).toBeNull();
    expect(grossValue({ ...base, indexer: "CDI_PCT", rate: 100 }, "2026-06-01", { cdi: [] })).toBeNull();
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
    const v = valueOf({ ...base, maturityDate: "2026-07-01" }, "2026-08-01", {})!;
    expect(v.matured).toBe(true);
    expect(v.daysToMaturity).toBeLessThan(0);
    expect(v.net).toBeGreaterThan(10_000);
    expect(v.net).toBeLessThan(v.gross);
    expect(describeRate("CDI_PCT", 110)).toBe("110% do CDI");
  });
});

import { ipcaFactor, makeAccrual, tesouroKey } from "../fixed-income";

describe("curva rápida (produtos prefixados)", () => {
  it("matches a naive day-by-day product at many dates, for both CDI indexers", () => {
    const cdi = cdiFlat("2025-12-01", "2026-09-30", 0.0507).map((r, i) => ({ ...r, close: 0.0507 + (i % 7) * 0.0004 }));
    for (const [indexer, rate] of [["CDI_PCT", 108], ["CDI_PLUS", 3.1]] as const) {
      const t: Terms = { ...base, indexer, rate, startDate: "2026-02-03", maturityDate: "2026-12-30" };
      const accrual = makeAccrual(t, { cdi });
      for (const asOf of ["2026-02-03", "2026-02-04", "2026-05-15", "2026-09-30", "2026-11-05", "2026-12-30", "2027-03-01"]) {
        const end = asOf < t.maturityDate ? asOf : t.maturityDate;
        let f = 1;
        let lastDate = t.startDate;
        let lastRate = cdi.filter((r) => r.date <= t.startDate).at(-1)?.close ?? cdi.at(-1)!.close;
        const daily = (c: number) => (indexer === "CDI_PCT" ? 1 + (c / 100) * (rate / 100) : (1 + c / 100) * Math.pow(1 + rate / 100, 1 / 252));
        for (const r of cdi.filter((x) => x.date > t.startDate && x.date <= end)) { f *= daily(r.close); lastDate = r.date; lastRate = r.close; }
        if (lastDate < end) f *= Math.pow(daily(lastRate), businessDaysBetween(lastDate, end));
        const expected = end <= t.startDate ? t.principal : t.principal * f;
        expect(accrual(asOf)).toBeCloseTo(expected, 6);
      }
    }
  });
});

describe("IPCA+", () => {
  const ipca = [
    { date: "2026-01-01", close: 0.5 }, { date: "2026-02-01", close: 0.4 }, { date: "2026-03-01", close: 0.3 }, { date: "2026-04-01", close: 0.2 },
  ];
  it("a full month contributes its whole IPCA; a partial month contributes pro rata", () => {
    expect(ipcaFactor("2026-01-31", "2026-02-28", ipca)).toBeCloseTo(1.004, 9); // fevereiro inteiro (31/01 é sábado)
    const half = ipcaFactor("2026-02-28", "2026-03-13", ipca); // 9 dos 22 dias úteis de março
    expect(half).toBeCloseTo(Math.pow(1.003, businessDaysBetween("2026-02-28", "2026-03-13") / 22), 9);
  });
  it("months without a published IPCA reuse the last one", () => {
    expect(ipcaFactor("2026-04-30", "2026-05-29", ipca)).toBeCloseTo(1.002, 9);
  });
  it("contract = IPCA × spread, capped at maturity; null without IPCA data", () => {
    const t: Terms = { ...base, indexer: "IPCA_PLUS", rate: 6, startDate: "2026-01-31", maturityDate: "2026-04-30" };
    const du = businessDaysBetween(t.startDate, "2026-04-30");
    const expected = 10_000 * ipcaFactor(t.startDate, "2026-04-30", ipca) * Math.pow(1.06, du / 252);
    expect(grossValue(t, "2026-04-30", { ipca })).toBeCloseTo(expected, 6);
    expect(grossValue(t, "2026-09-01", { ipca })).toBeCloseTo(expected, 6);
    expect(grossValue(t, "2026-04-30", {})).toBeNull();
  });
});

describe("Tesouro Direto", () => {
  const key = tesouroKey("Tesouro Selic", "2029-03-01");
  const pu = new Map([[key, [{ date: "2026-01-05", close: 15_000 }, { date: "2026-01-06", close: 15_010 }, { date: "2026-01-09", close: 15_040 }]]]);
  const t: Terms = { kind: "TESOURO", indexer: "TESOURO", rate: 0, principal: 1_500, startDate: "2026-01-05", maturityDate: "2029-03-01", quantity: 0.1, tdTitle: "Tesouro Selic" };
  it("values quantity × PU de venda using the last price on or before the date", () => {
    expect(grossValue(t, "2026-01-06", { tesouro: pu })).toBeCloseTo(1_501, 6);
    expect(grossValue(t, "2026-01-08", { tesouro: pu })).toBeCloseTo(1_501, 6); // sem preço no dia 08: vale o do dia 06
    expect(grossValue(t, "2026-02-01", { tesouro: pu })).toBeCloseTo(1_504, 6);
    expect(grossValue(t, "2026-01-05", { tesouro: pu })).toBe(1_500);
  });
  it("needs the price series, title and quantity", () => {
    expect(grossValue(t, "2026-02-01", {})).toBeNull();
    expect(grossValue({ ...t, tdTitle: null }, "2026-02-01", { tesouro: pu })).toBeNull();
    expect(grossValue({ ...t, quantity: null }, "2026-02-01", { tesouro: pu })).toBeNull();
    expect(valueOf(t, "2026-02-01", { tesouro: pu })!.net).toBeLessThan(1_504); // IR sobre o ganho
  });
});

import { looksPartial, partialFraction, OPEN_END } from "../fixed-income";

describe("resgate parcial", () => {
  it("fraction of the balance taken out; rejects zero, missing estimate and amounts that are not partial", () => {
    expect(partialFraction(3_000, 750)).toEqual({ fraction: 0.25 });
    expect("error" in partialFraction(null, 100)).toBe(true);
    expect("error" in partialFraction(3_000, 0)).toBe(true);
    expect("error" in partialFraction(3_000, 3_000)).toBe(true);
    expect("error" in partialFraction(3_000, 4_000)).toBe(true);
  });
  it("a total redemption far below the estimate looks partial (the case of R$ 296 on R$ 3.2 mil)", () => {
    expect(looksPartial(3_262, 296)).toBe(true);
    expect(looksPartial(3_262, 3_250)).toBe(false); // diferença pequena: é só o saldo real do banco
    expect(looksPartial(null, 296)).toBe(false);
  });
  it("splitting by the fraction keeps the total value (everything scales with the principal)", () => {
    const t: Terms = { ...base, principal: 3_259.16, startDate: "2026-10-27", maturityDate: "2027-10-27" };
    const full = grossValue(t, "2026-11-13", {})!;
    const f = 0.1;
    const a = grossValue({ ...t, principal: t.principal * f }, "2026-11-13", {})!;
    const b = grossValue({ ...t, principal: t.principal * (1 - f) }, "2026-11-13", {})!;
    expect(a + b).toBeCloseTo(full, 8);
  });
});

describe("sem vencimento", () => {
  it("an open-ended contract keeps accruing, never matures and has no days to maturity", () => {
    const t: Terms = { ...base, maturityDate: OPEN_END };
    expect(grossValue(t, "2030-01-01", {})!).toBeGreaterThan(grossValue(t, "2027-01-05", {})!);
    const v = valueOf(t, "2026-11-13", {})!;
    expect(v.matured).toBe(false);
    expect(v.daysToMaturity).toBeNull();
    expect(v.net).toBeGreaterThan(10_000);
  });
});
