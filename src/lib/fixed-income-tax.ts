import { IR_EXEMPT, valueOf, type Kind, type Rates, type Terms } from "./fixed-income";

/** Resumo de renda fixa para a declaração do IR. Estimativa: o informe de rendimentos do banco é o documento que vale. */

export interface FiTaxItem {
  id: string;
  label: string;
  issuer: string;
  terms: Terms;
  redeemedAt: string | null;
  redeemedNet: number | null;
}

export interface FiRedemption {
  id: string;
  label: string;
  issuer: string;
  kind: Kind;
  principal: number;
  startDate: string;
  redeemedAt: string;
  received: number; // valor líquido recebido
  yieldNet: number; // recebido − aplicado
  irWithheld: number | null; // IR retido na fonte (estimado pelas condições; null sem dados de mercado)
  exempt: boolean;
}

export interface FiHolding {
  id: string;
  label: string;
  issuer: string;
  kind: Kind;
  principal: number;
  gross: number | null;
  net: number | null;
}

export interface FiYear {
  year: number;
  redemptions: FiRedemption[];
  taxedYieldNet: number; // rendimentos líquidos de CDB, debêntures, Tesouro… (tributação exclusiva/definitiva)
  irWithheld: number;
  exemptYield: number; // LCI, LCA, CRI, CRA
  holdingsDate: string; // 31/12, ou hoje para o ano corrente
  holdings: FiHolding[];
}

export function fixedIncomeTaxSummary(items: FiTaxItem[], rates: Rates, years: number[], today: string): FiYear[] {
  return years.map((year) => {
    const holdingsDate = year === Number(today.slice(0, 4)) ? today : `${year}-12-31`;

    const redemptions: FiRedemption[] = items
      .filter((i) => i.redeemedAt && i.redeemedAt.startsWith(String(year)))
      .map((i) => {
        const exempt = IR_EXEMPT.includes(i.terms.kind);
        const est = valueOf(i.terms, i.redeemedAt!, rates);
        const received = i.redeemedNet ?? est?.net ?? i.terms.principal;
        return {
          id: i.id, label: i.label, issuer: i.issuer, kind: i.terms.kind, principal: i.terms.principal, startDate: i.terms.startDate,
          redeemedAt: i.redeemedAt!, received, yieldNet: received - i.terms.principal, irWithheld: exempt ? 0 : est ? est.ir : null, exempt,
        };
      })
      .sort((a, b) => a.redeemedAt.localeCompare(b.redeemedAt));

    const holdings: FiHolding[] = items
      .filter((i) => i.terms.startDate <= holdingsDate && (!i.redeemedAt || i.redeemedAt > holdingsDate))
      .map((i) => {
        const v = valueOf(i.terms, holdingsDate, rates);
        return { id: i.id, label: i.label, issuer: i.issuer, kind: i.terms.kind, principal: i.terms.principal, gross: v?.gross ?? null, net: v?.net ?? null };
      });

    return {
      year,
      redemptions,
      taxedYieldNet: redemptions.filter((r) => !r.exempt).reduce((s, r) => s + r.yieldNet, 0),
      irWithheld: redemptions.reduce((s, r) => s + (r.irWithheld ?? 0), 0),
      exemptYield: redemptions.filter((r) => r.exempt).reduce((s, r) => s + r.yieldNet, 0),
      holdingsDate,
      holdings,
    };
  });
}
