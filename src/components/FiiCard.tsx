"use client";
import { useState } from "react";
import { FII_SEGMENTS, type FiiMetrics } from "@/lib/fii";
import { fmtMoney, fmtNum, fmtPct, parseQty } from "@/lib/format";

const num = (s: string) => (s.trim() === "" ? null : parseQty(s));

/** FII indicators plus the manual fields (vacancy, segment) that the free data sources do not provide. */
export function FiiCard({ assetId, fii, currency, onSaved }: { assetId: string; fii: FiiMetrics; currency: string; onSaved: () => void }) {
  const [vp, setVp] = useState(fii.vacancyPhysical !== undefined ? String(fii.vacancyPhysical) : "");
  const [vf, setVf] = useState(fii.vacancyFinancial !== undefined ? String(fii.vacancyFinancial) : "");
  const [seg, setSeg] = useState(fii.segment ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const r = await fetch(`/api/assets/${assetId}/fii`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vacancyPhysical: num(vp), vacancyFinancial: num(vf), segment: seg || null }),
    });
    if (!r.ok) return setMsg({ ok: false, text: (await r.json()).error ?? "Erro" });
    setMsg({ ok: true, text: "Salvo." });
    onSaved();
  };

  const rows: [string, string][] = [
    ["P/VP", fmtNum(fii.pvp, 2)],
    ["Desconto (−) ou ágio (+) ao VPA", fmtPct(fii.discountPct, 1)],
    ["Último rendimento por cota", fmtMoney(fii.lastDividend, currency)],
    ["DY mensal (último)", fmtPct(fii.dyMonthlyLastPct, 2, false)],
    ["DY mensal médio (12m)", fmtPct(fii.dyMonthlyAvgPct, 2, false)],
    ["DY 12 meses", fmtPct(fii.dy12mPct, 1, false)],
    ["Meses com pagamento (12m)", `${fii.paymentMonths12}/12`],
    ["Tendência dos rendimentos", fmtPct(fii.dividendTrendPct, 1)],
    ["Vacância física", fii.vacancyPhysical !== undefined ? fmtPct(fii.vacancyPhysical, 1, false) : "não informada"],
    ["Vacância financeira", fii.vacancyFinancial !== undefined ? fmtPct(fii.vacancyFinancial, 1, false) : "não informada"],
    ["Placar por regras (−100 a 100)", String(fii.score)],
  ];

  return (
    <section className="card p-4 lg:col-span-2">
      <h2 className="font-semibold mb-3">Indicadores de FII</h2>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dl className="text-sm divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>
            ))}
          </dl>
          <ul className="text-sm space-y-1 mt-4">
            {fii.signals.map((s) => (
              <li key={s.label} className="flex gap-2"><span className={s.ok === null ? "text-muted" : s.ok ? "text-up" : "text-down"}>{s.ok === null ? "○" : s.ok ? "✓" : "✗"}</span>{s.label}</li>
            ))}
          </ul>
          <p className="text-[11px] text-muted mt-3">Limiares aproximados (P/VP ≤ 1, DY ≥ 8%, vacância ≤ 10%): ajuste a leitura ao cenário de juros. Graham, Bazin e P/L não se aplicam a fundos.</p>
        </div>
        <form onSubmit={save} className="space-y-3 text-sm">
          <h3 className="font-medium">Dados do relatório gerencial</h3>
          <p className="text-xs text-muted">O Yahoo não informa vacância nem segmento. Copie do relatório mensal do fundo (site do administrador ou Funds Explorer) para o Gemini e o placar usarem.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-muted block mb-1">Vacância física (%)</span><input className="input w-full" inputMode="decimal" value={vp} onChange={(e) => setVp(e.target.value)} /></label>
            <label className="block"><span className="text-xs text-muted block mb-1">Vacância financeira (%)</span><input className="input w-full" inputMode="decimal" value={vf} onChange={(e) => setVf(e.target.value)} /></label>
          </div>
          <label className="block"><span className="text-xs text-muted block mb-1">Segmento</span>
            <select className="input w-full" value={seg} onChange={(e) => setSeg(e.target.value)}>
              <option value="">—</option>
              {FII_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button className="btn">Salvar</button>
            {msg && <span className={`text-sm ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
