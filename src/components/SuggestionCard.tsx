import { fmtMoney, fmtPct } from "@/lib/format";

export interface SuggestionRow {
  id: string;
  action: "COMPRAR" | "MANTER" | "VENDER" | string;
  confidence: number;
  targetPrice: number | null;
  rationale: string;
  risks: string;
  indicators: string;
  model: string;
  createdAt: string;
  asset: { id: string; ticker: string; currency: string };
}

const COLORS: Record<string, string> = { COMPRAR: "bg-up/15 text-up", MANTER: "bg-yellow-500/15 text-yellow-400", VENDER: "bg-down/15 text-down" };

export function SuggestionCard({ s }: { s: SuggestionRow }) {
  const ind = JSON.parse(s.indicators || "{}");
  const risks: string[] = JSON.parse(s.risks || "[]");
  const price: number | undefined = ind.price;
  const upside = s.targetPrice && price ? (s.targetPrice / price - 1) * 100 : undefined;
  return (
    <article className="card p-4 space-y-3">
      <header className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        <a href={`/ativos/${s.asset.id}`} className="font-semibold text-lg hover:underline">{s.asset.ticker}</a>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${COLORS[s.action] ?? ""}`}>{s.action}</span>
        <span className="text-xs text-muted ml-auto">confiança {Math.round(s.confidence * 100)}%</span>
      </header>
      <dl className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2 text-xs">
        <Stat label="Preço" value={fmtMoney(price, s.asset.currency)} />
        <Stat label="Alvo IA" value={fmtMoney(s.targetPrice, s.asset.currency)} sub={fmtPct(upside, 1)} />
        <Stat label="Graham" value={fmtMoney(ind.valuation?.grahamValue, s.asset.currency)} sub={ind.valuation?.grahamMargin !== undefined ? `margem ${fmtPct(ind.valuation.grahamMargin * 100, 0)}` : undefined} />
        <Stat label="Bazin" value={fmtMoney(ind.valuation?.bazinCeiling, s.asset.currency)} />
        <Stat label="P/L" value={ind.valuation?.pe?.toFixed?.(1) ?? "—"} />
        <Stat label="Placar regras" value={ind.valuation ? String(ind.valuation.score) : "—"} />
      </dl>
      <p className="text-sm leading-relaxed">{s.rationale}</p>
      {risks.length > 0 && (
        <ul className="text-xs text-muted list-disc pl-4 space-y-0.5">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      <footer className="text-[11px] text-muted">{s.model} · {new Date(s.createdAt).toLocaleString("pt-BR")}</footer>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-panel-2 rounded-md px-2 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-sm">{value}{sub && <span className="block text-[11px] text-muted">{sub}</span>}</dd>
    </div>
  );
}
