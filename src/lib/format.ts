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
