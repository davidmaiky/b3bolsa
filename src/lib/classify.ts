import type { AssetClass } from "./types";

/** B3 listings that are not plain stocks. Yahoo labels both FIIs and ETFs inconsistently, so the name helps. */
export function classifyB3(ticker: string, quoteType: string, name: string): "B3" | "FII" | "ETF" {
  const t = ticker.toUpperCase();
  const n = name.toUpperCase();
  const imob = /\bFII\b|FDO\.? ?(DE )?INV\.? ?IMOB|FUNDO.*IMOBILI|\bIMOB\b/.test(n);
  if (imob) return "FII";
  if (quoteType === "ETF" || /FUNDO DE [IÍ]NDICE|\bETF\b|ISHARES|\bBOVA\b|\bIVVB\b/.test(n)) return "ETF";
  // 11 is also used by units (TAEE11, SANB11): without a hint from the name, keep them as stocks
  void t;
  return "B3";
}

export const isB3Listed = (c: AssetClass | string) => c === "B3" || c === "FII" || c === "ETF";
/** Classes with a fundamentals/dividend history on Yahoo. */
export const hasFundamentals = (c: AssetClass | string) => isB3Listed(c) || c === "US";
