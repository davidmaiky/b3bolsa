import type { Fundamentals } from "./yahoo";
import { bazinCeiling, grahamValue } from "./indicators";

export const ALERT_TYPES = ["ABOVE", "BELOW", "BELOW_BAZIN", "BELOW_GRAHAM"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_LABEL: Record<AlertType, string> = {
  ABOVE: "Preço subir até",
  BELOW: "Preço cair até",
  BELOW_BAZIN: "Preço ≤ teto de Bazin",
  BELOW_GRAHAM: "Preço ≤ valor de Graham",
};

/** Dynamic alerts (Bazin/Graham) take their threshold from the fundamentals instead of a typed price. */
export const isDynamic = (t: string) => t === "BELOW_BAZIN" || t === "BELOW_GRAHAM";

export function thresholdFor(type: string, target: number | null | undefined, f: Fundamentals | null | undefined): number | undefined {
  if (type === "BELOW_BAZIN") return bazinCeiling(f?.dividendRate);
  if (type === "BELOW_GRAHAM") return grahamValue(f?.eps, f?.bookValuePerShare);
  return typeof target === "number" && target > 0 ? target : undefined;
}

export function isTriggered(type: string, price: number, threshold: number | undefined): boolean {
  if (threshold === undefined || !Number.isFinite(price) || !Number.isFinite(threshold)) return false;
  return type === "ABOVE" ? price >= threshold : price <= threshold;
}

export function describeAlert(type: string, threshold: number | undefined, fmt: (n: number) => string): string {
  const v = threshold === undefined ? "—" : fmt(threshold);
  if (type === "ABOVE") return `subir até ${v}`;
  if (type === "BELOW") return `cair até ${v}`;
  if (type === "BELOW_BAZIN") return `ficar abaixo do teto de Bazin (${v})`;
  return `ficar abaixo do valor de Graham (${v})`;
}
