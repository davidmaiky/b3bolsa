export const fmtMoney = (v: number | undefined | null, currency = "BRL") =>
  v === undefined || v === null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: Math.abs(v) < 1 ? 6 : 2 });

export const fmtNum = (v: number | undefined | null, digits = 2) =>
  v === undefined || v === null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

export const fmtPct = (v: number | undefined | null, digits = 2, signed = true) =>
  v === undefined || v === null || !Number.isFinite(v)
    ? "—"
    : `${signed && v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

export const tone = (v: number | undefined | null) => (!v ? "text-muted" : v > 0 ? "text-up" : "text-down");

// ---------------- leitura de números digitados (pt-BR) ----------------

/**
 * Reads what the user typed. `money: true` is for amounts: a lone dot followed by exactly three digits ("68.800") is a thousands
 * separator, as people write in Brazil. Quantities (`money: false`) keep a lone dot as a decimal point ("0.5", "1.234" crypto).
 * "68.800,00" → 68800, "1.234,5" → 1234.5, "0,5" → 0.5, "68800" → 68800, "R$ 1.500,00" → 1500. Returns NaN when it is not a number.
 */
export function parseNumber(input: string, money = true): number {
  let s = input.trim().replace(/[^\d.,-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return NaN;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : "."; // the last separator is the decimal one
    const thou = dec === "," ? "." : ",";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (commas) {
    s = commas > 1 ? s.split(",").join("") : s.replace(",", ".");
  } else if (dots > 1) {
    s = s.split(".").join("");
  } else if (dots === 1 && money && /^[1-9]\d{0,2}\.\d{3}$/.test(s)) {
    s = s.replace(".", "");
  }
  const n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  return neg ? -n : n;
}
export const parseMoney = (s: string) => parseNumber(s, true);
export const parseQty = (s: string) => parseNumber(s, false);
