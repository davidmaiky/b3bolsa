"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";
import { valuePosition } from "@/lib/portfolio";
import { rebalance } from "@/lib/rebalance";
import { fmtMoney, fmtPct, tone } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";
import type { PositionRow } from "@/lib/server-portfolio";

const CLASSES: AssetClass[] = ["B3", "FII", "ETF", "US", "CRYPTO", "FX"];
const num = (s: string) => Number(s.replace(",", ".")) || 0;

export default function RebalanceamentoPage() {
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [form, setForm] = useState<Record<string, string>>({ B3: "", FII: "", ETF: "", US: "", CRYPTO: "", FX: "" });
  const [contribution, setContribution] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const { quotes } = useLivePrices();
  const fx = quotes["USD:FX"]?.price;

  const load = useCallback(() => {
    fetch("/api/portfolio").then((r) => r.json()).then((d) => setPositions(d.positions));
    fetch("/api/targets").then((r) => r.json()).then((t: Record<string, number>) => {
      setSaved(t);
      setForm(Object.fromEntries(CLASSES.map((c) => [c, t[c] !== undefined ? String(t[c]) : ""])));
    });
  }, []);
  useEffect(load, [load]);

  const current = useMemo(() => {
    const out: Record<string, number> = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    for (const p of positions ?? []) {
      if (p.quantity <= 0) continue;
      const rate = p.currency === "USD" ? fx ?? NaN : 1;
      const v = valuePosition(p, quotes[p.quoteKey]?.price, rate);
      const brl = v.marketValueBrl ?? v.costBrl;
      if (Number.isFinite(brl)) out[p.assetClass] += brl;
    }
    return out;
  }, [positions, quotes, fx]);

  const sum = CLASSES.reduce((s, c) => s + num(form[c]), 0);
  const missingFx = !fx && (positions ?? []).some((p) => p.quantity > 0 && p.currency === "USD");
  const hasTargets = Object.keys(saved).length > 0;
  const total = Object.values(current).reduce((s, v) => s + v, 0);
  const aporte = num(contribution);
  const rows = useMemo(() => rebalance(current, saved, aporte), [current, saved, aporte]);

  const save = async () => {
    setErr(null);
    setOk(false);
    const body = Object.fromEntries(CLASSES.map((c) => [c, num(form[c])]));
    const r = await fetch("/api/targets", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setOk(true);
    load();
  };

  if (!positions) return <p className="text-muted">Carregando…</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Rebalanceamento</h1>

      {missingFx && <p className="text-xs text-yellow-400">Aguardando a cotação USD/BRL: posições em dólar ainda não entram nos valores.</p>}

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Meta de alocação (% do patrimônio)</h2>
          <span className={`num text-sm ${Math.abs(sum - 100) < 0.01 || sum === 0 ? "text-muted" : "text-down"}`}>soma {sum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end text-sm">
          {CLASSES.map((c) => (
            <label key={c} className="block">
              <span className="text-xs text-muted block mb-1">{ASSET_CLASS_LABEL[c]}</span>
              <input className="input w-full" inputMode="decimal" placeholder="0" value={form[c]} onChange={(e) => { setOk(false); setForm({ ...form, [c]: e.target.value }); }} />
            </label>
          ))}
          <button className="btn col-span-2 md:col-span-1 md:h-[34px]" onClick={save}>Salvar metas</button>
        </div>
        {err && <p className="text-down text-sm">{err}</p>}
        {ok && <p className="text-up text-sm">Metas salvas.</p>}
      </section>

      {!hasTargets ? (
        <p className="text-muted text-sm">Defina as metas acima (somando 100%) para ver o desvio e calcular onde aplicar um aporte.</p>
      ) : (
        <>
          <section className="card p-4 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <label className="block flex-1 min-w-[200px] max-w-xs">
                <span className="text-xs text-muted block mb-1">Quanto quer aportar? (R$)</span>
                <input className="input w-full" inputMode="decimal" placeholder="0" value={contribution} onChange={(e) => setContribution(e.target.value)} />
              </label>
              <p className="text-xs text-muted pb-2">O aporte vai só para classes abaixo da meta, sem vender nada.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
                <thead className="text-muted text-xs">
                  <tr className="text-right">
                    <th className="text-left font-normal py-2">Classe</th><th className="font-normal">Atual</th><th className="font-normal">%</th><th className="font-normal">Meta</th><th className="font-normal">Desvio</th>
                    <th className="font-normal">Para chegar na meta</th>{aporte > 0 && <><th className="font-normal">Aportar</th><th className="font-normal">% depois</th></>}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((r) => r.targetPct > 0 || r.current > 0).map((r) => (
                    <tr key={r.assetClass} className="border-t border-line text-right">
                      <td className="text-left py-2 font-medium">{ASSET_CLASS_LABEL[r.assetClass as AssetClass] ?? r.assetClass}</td>
                      <td className="num">{fmtMoney(r.current)}</td>
                      <td className="num">{fmtPct(r.currentPct, 1, false)}</td>
                      <td className="num text-muted">{fmtPct(r.targetPct, 1, false)}</td>
                      <td className={`num ${tone(-r.deviationPp)}`}>{fmtPct(r.deviationPp, 1)}</td>
                      <td className={`num ${tone(r.diffToTarget)}`}>{Math.abs(r.diffToTarget) < 0.5 ? "—" : `${r.diffToTarget > 0 ? "comprar" : "vender"} ${fmtMoney(Math.abs(r.diffToTarget))}`}</td>
                      {aporte > 0 && <><td className={`num ${r.contribution > 0 ? "text-up font-semibold" : "text-muted"}`}>{r.contribution > 0 ? fmtMoney(r.contribution) : "—"}</td><td className="num text-muted">{fmtPct(r.afterPct, 1, false)}</td></>}
                    </tr>
                  ))}
                  <tr className="border-t border-line text-right font-semibold"><td className="text-left py-2">Total</td><td className="num">{fmtMoney(total)}</td><td colSpan={aporte > 0 ? 6 : 4} /></tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">Valores em reais, a preços de mercado agora. O app não escolhe ativos dentro da classe: use as Sugestões IA e a página de cada ativo para isso. Antes de vender, lembre do imposto (página IR).</p>
          </section>
        </>
      )}
    </div>
  );
}
