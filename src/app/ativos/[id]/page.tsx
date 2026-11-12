"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtMoney, fmtNum, fmtPct, tone } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";
import type { AssetAnalysis } from "@/lib/analysis";
import { SuggestionCard, type SuggestionRow } from "@/components/SuggestionCard";

interface Data {
  asset: { id: string; ticker: string; name: string | null; assetClass: AssetClass; currency: string; suggestions: Omit<SuggestionRow, "asset">[] };
  analysis: AssetAnalysis;
  history: { date: string; close: number }[];
}

export default function AtivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { quotes } = useLivePrices();

  const load = useCallback(() => {
    fetch(`/api/assets/${id}/analysis`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setErr(j.error);
      else setD(j);
    });
  }, [id]);
  useEffect(load, [load]);

  if (err && !d) return <p className="text-down">{err}</p>;
  if (!d) return <p className="text-muted">Carregando análise…</p>;
  const { asset, analysis: a, history } = d;
  const cur = asset.currency;
  const q = quotes[`${asset.ticker}:${asset.assetClass}`];
  const price = q?.price ?? a.price;
  const f = a.fundamentals;
  const v = a.valuation;
  const m = a.momentum;

  const runAi = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [id] }) });
    setBusy(false);
    if (!r.ok) setErr((await r.json()).error);
    load();
  };

  return (
    <div className="space-y-5">
      <header className="flex items-end gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted">{ASSET_CLASS_LABEL[asset.assetClass]}{f?.sector ? ` · ${f.sector}` : ""}</p>
          <h1 className="text-2xl font-semibold">{asset.ticker} <span className="text-muted text-base font-normal">{f?.name ?? asset.name}</span></h1>
        </div>
        <div className="num text-2xl">{fmtMoney(price, cur)}</div>
        <div className={`num ${tone(q?.changePct)}`}>{fmtPct(q?.changePct)}</div>
        <span className="text-xs text-muted">{q?.source === "lse-ws" ? "LSE tempo real" : q?.delayed ? "Yahoo · atraso ~15 min" : q?.source ?? ""}</span>
        <button className="btn ml-auto" onClick={runAi} disabled={busy}>{busy ? "Analisando…" : "Analisar com IA"}</button>
      </header>
      {err && <p className="text-down text-sm">{err}</p>}

      <section className="card p-4 h-72">
        {history.length ? (
          <ResponsiveContainer>
            <LineChart data={history} margin={{ left: 8, right: 8 }}>
              <XAxis dataKey="date" tick={{ fill: "#8b98a8", fontSize: 11 }} minTickGap={50} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#8b98a8", fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ background: "#121821", border: "1px solid #243040" }} formatter={(x) => fmtMoney(Number(x), cur)} />
              <Line type="monotone" dataKey="close" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
              {a.position && <ReferenceLine ifOverflow="extendDomain" y={a.position.avgPrice} stroke="#a855f7" strokeDasharray="4 4" label={{ value: "Preço médio", fill: "#a855f7", fontSize: 11 }} />}
              {v?.grahamValue && <ReferenceLine ifOverflow="extendDomain" y={v.grahamValue} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "Graham", fill: "#22c55e", fontSize: 11 }} />}
              {v?.bazinCeiling && <ReferenceLine ifOverflow="extendDomain" y={v.bazinCeiling} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Bazin", fill: "#f59e0b", fontSize: 11 }} />}
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-muted text-sm">Histórico indisponível.</p>}
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        {v && (
          <section className="card p-4">
            <h2 className="font-semibold mb-3">Valuation</h2>
            <Rows rows={[
              ["Valor de Graham", fmtMoney(v.grahamValue, cur)],
              ["Margem de segurança (Graham)", fmtPct(v.grahamMargin !== undefined ? v.grahamMargin * 100 : undefined, 1)],
              ["Preço teto Bazin (6%)", fmtMoney(v.bazinCeiling, cur)],
              ["Margem (Bazin)", fmtPct(v.bazinMargin !== undefined ? v.bazinMargin * 100 : undefined, 1)],
              ["P/L × P/VP", fmtNum(v.peTimesPb, 1)],
              ["Placar por regras (−100 a 100)", String(v.score)],
            ]} />
            <h3 className="text-sm font-medium mt-4 mb-2">Critérios de Graham</h3>
            <ul className="text-sm space-y-1">
              {v.grahamCriteria.map((c) => (
                <li key={c.label} className="flex gap-2"><span className={c.ok === null ? "text-muted" : c.ok ? "text-up" : "text-down"}>{c.ok === null ? "○" : c.ok ? "✓" : "✗"}</span>{c.label}</li>
              ))}
            </ul>
          </section>
        )}
        {f && (
          <section className="card p-4">
            <h2 className="font-semibold mb-3">Fundamentos</h2>
            <Rows rows={[
              ["P/L", fmtNum(f.pe, 2)],
              ["P/L projetado", fmtNum(f.forwardPe, 2)],
              ["P/VP", fmtNum(f.pb, 2)],
              ["LPA", fmtMoney(f.eps, cur)],
              ["VPA", fmtMoney(f.bookValuePerShare, cur)],
              ["Dividend yield", fmtPct(f.dividendYield !== undefined ? f.dividendYield * 100 : undefined, 2, false)],
              ["DPA (12m)", fmtMoney(f.dividendRate, cur)],
              ["ROE", fmtPct(f.roe !== undefined ? f.roe * 100 : undefined, 1, false)],
              ["Margem líquida", fmtPct(f.profitMargin !== undefined ? f.profitMargin * 100 : undefined, 1, false)],
              ["Dívida/PL", fmtPct(f.debtToEquity, 0, false)],
              ["Cresc. lucro", fmtPct(f.earningsGrowth !== undefined ? f.earningsGrowth * 100 : undefined, 1)],
              ["PEG", fmtNum(f.pegRatio, 2)],
              ["EV/EBITDA", fmtNum(f.evToEbitda, 1)],
            ]} />
          </section>
        )}
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Momento</h2>
          <Rows rows={[
            ["Retorno 30d", fmtPct(m.return30d !== undefined ? m.return30d * 100 : undefined, 1)],
            ["Retorno 90d", fmtPct(m.return90d !== undefined ? m.return90d * 100 : undefined, 1)],
            ["Retorno 12m", fmtPct(m.return365d !== undefined ? m.return365d * 100 : undefined, 1)],
            ["Volatilidade anual", fmtPct(m.volatilityAnnual !== undefined ? m.volatilityAnnual * 100 : undefined, 1, false)],
            ["RSI 14", fmtNum(m.rsi14, 1)],
            ["MM200", fmtMoney(m.sma200, cur)],
            ["Distância da MM200", fmtPct(m.distSma200 !== undefined ? m.distSma200 * 100 : undefined, 1)],
          ]} />
          {a.position && (
            <>
              <h3 className="text-sm font-medium mt-4 mb-2">Sua posição</h3>
              <Rows rows={[
                ["Quantidade", fmtNum(a.position.quantity, 8)],
                ["Preço médio", fmtMoney(a.position.avgPrice, cur)],
                ["Resultado", fmtPct(price ? (price / a.position.avgPrice - 1) * 100 : undefined)],
              ]} />
            </>
          )}
        </section>
      </div>

      {asset.suggestions.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Sugestões anteriores</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {asset.suggestions.map((s) => <SuggestionCard key={s.id} s={{ ...s, asset }} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="text-sm divide-y divide-line">
      {rows.map(([k, val]) => (
        <div key={k} className="flex justify-between py-1.5"><dt className="text-muted">{k}</dt><dd className="num">{val}</dd></div>
      ))}
    </dl>
  );
}
