"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { valuePosition } from "@/lib/portfolio";
import { fmtMoney, fmtNum, fmtPct, tone } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass, type Quote } from "@/lib/types";
import type { PositionRow } from "@/lib/server-portfolio";
import { AddAsset } from "./AddAsset";

const CLASS_COLOR: Record<AssetClass, string> = { B3: "#22c55e", FII: "#14b8a6", ETF: "#eab308", US: "#3b82f6", CRYPTO: "#f59e0b", FX: "#a855f7" };

export function Dashboard() {
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const { quotes, dir, connected } = useLivePrices();

  const load = useCallback(() => {
    fetch("/api/portfolio").then((r) => r.json()).then((d) => setPositions(d.positions));
  }, []);
  useEffect(load, [load]);

  const fx = quotes["USD:FX"]?.price;
  const rows = useMemo(
    () =>
      (positions ?? []).map((p) => {
        const q: Quote | undefined = quotes[p.quoteKey];
        const rate = p.currency === "USD" ? fx ?? NaN : 1; // NaN until USD/BRL arrives
        return { p, q, v: valuePosition(p, q?.price, rate, q?.changePct) };
      }),
    [positions, quotes, fx],
  );
  const held = rows.filter((r) => r.p.quantity > 0);
  const watch = rows.filter((r) => r.p.quantity === 0);

  const fin = (x: number) => (Number.isFinite(x) ? x : 0);
  const total = held.reduce((s, r) => s + fin(r.v.marketValueBrl ?? r.v.costBrl), 0);
  const cost = held.reduce((s, r) => s + fin(r.v.costBrl), 0);
  const realized = rows.reduce((s, r) => s + fin(r.p.realizedPnl * r.v.fxToBrl), 0);
  const divs12 = held.reduce((s, r) => s + fin(r.p.dividendsNet12m * r.v.fxToBrl), 0);
  const missingFx = !fx && held.some((r) => r.p.currency === "USD");
  const dayPnl = held.reduce((s, r) => {
    const pc = r.q?.previousClose;
    if (!pc || !r.q) return s;
    return s + fin((r.q.price - pc) * r.p.quantity * r.v.fxToBrl);
  }, 0);
  const byClass = Object.entries(
    held.reduce<Record<string, number>>((acc, r) => {
      acc[r.p.assetClass] = (acc[r.p.assetClass] ?? 0) + fin(r.v.marketValueBrl ?? r.v.costBrl);
      return acc;
    }, {}),
  ).map(([k, value]) => ({ name: ASSET_CLASS_LABEL[k as AssetClass], value, color: CLASS_COLOR[k as AssetClass] }));

  if (!positions) return <p className="text-muted">Carregando…</p>;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Patrimônio" value={fmtMoney(total)} wide />
        <Kpi label="Custo" value={fmtMoney(cost)} />
        <Kpi label="Resultado não realizado" value={fmtMoney(total - cost)} sub={fmtPct(cost ? ((total - cost) / cost) * 100 : undefined)} t={total - cost} />
        <Kpi label="Resultado do dia" value={fmtMoney(dayPnl)} sub={fmtPct(total - dayPnl ? (dayPnl / (total - dayPnl)) * 100 : undefined)} t={dayPnl} />
        <Kpi label="Realizado" value={fmtMoney(realized)} t={realized} sub={`USD/BRL ${fmtNum(fx, 4)}`} />
        <Kpi label="Proventos (12m)" value={fmtMoney(divs12)} sub={`YoC ${fmtPct(cost ? (divs12 / cost) * 100 : undefined, 2, false)}`} t={divs12} wide />
      </section>
      {missingFx && <p className="text-xs text-yellow-400">Aguardando a cotação USD/BRL: posições em dólar ainda não entram no total.</p>}

      <section className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="font-semibold">Posições</h2>
            <AddAsset onAdded={load} />
          </div>
          <PositionsTable rows={held} dir={dir} total={total} />
          {held.length === 0 && <p className="text-muted text-sm py-6 text-center">Adicione um ativo e lance uma compra em Transações.</p>}
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Alocação</h2>
          {byClass.length ? (
            <>
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byClass} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} stroke="none">
                      {byClass.map((c) => <Cell key={c.name} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ background: "#121821", border: "1px solid #243040" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="text-sm space-y-1">
                {byClass.map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="num text-muted">{fmtPct((c.value / total) * 100, 1, false)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-muted text-sm">Sem posições.</p>}
          <p className={`text-xs mt-4 ${connected ? "text-muted" : "text-down"}`}>{connected ? "Atualização em tempo real ativa" : "Reconectando ao stream…"}</p>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-semibold">Watchlist</h2>
          <AddAsset onAdded={load} watchlist />
        </div>
        <table className="w-full text-sm">
          <tbody>
            {watch.map(({ p, q }) => (
              <tr key={p.assetId} className="border-t border-line">
                <td className="py-2"><Link className="font-medium hover:underline" href={`/ativos/${p.assetId}`}>{p.ticker}</Link> <span className="text-muted text-xs">{ASSET_CLASS_LABEL[p.assetClass]}</span></td>
                <td className={`num text-right ${flash(dir[p.quoteKey])}`} key={dir[p.quoteKey]?.n}>{fmtMoney(q?.price, p.currency)}</td>
                <td className={`num text-right w-24 ${tone(q?.changePct)}`}>{fmtPct(q?.changePct)}</td>
                <td className="text-right w-20"><button className="text-xs text-muted hover:text-down" onClick={() => fetch(`/api/assets/${p.assetId}`, { method: "DELETE" }).then(load)}>remover</button></td>
              </tr>
            ))}
            {watch.length === 0 && <tr><td className="text-muted py-3">Nenhum ativo observado.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const flash = (d?: { d: "up" | "down" }) => (d ? (d.d === "up" ? "flash-up" : "flash-down") : "");

function Kpi({ label, value, sub, t, wide }: { label: string; value: string; sub?: string; t?: number; wide?: boolean }) {
  return (
    <div className={`card p-3 sm:p-4 ${wide ? "col-span-2 lg:col-span-1" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-lg font-semibold mt-1 ${t === undefined ? "" : tone(t)}`}>{value}</p>
      {sub && <p className={`num text-xs mt-0.5 ${t === undefined ? "text-muted" : tone(t)}`}>{sub}</p>}
    </div>
  );
}

function PositionsTable({ rows, dir, total }: { rows: { p: PositionRow; q?: Quote; v: ReturnType<typeof valuePosition> }[]; dir: Record<string, { d: "up" | "down"; n: number }>; total: number }) {
  return (
    <>
    <ul className="md:hidden divide-y divide-line">
      {rows.map(({ p, q, v }) => (
        <li key={p.assetId} className="py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
          <div>
            <Link href={`/ativos/${p.assetId}`} className="font-medium hover:underline">{p.ticker}</Link>
            <span className="text-xs text-muted"> · {ASSET_CLASS_LABEL[p.assetClass]} · {fmtPct(total ? ((v.marketValueBrl ?? v.costBrl) / total) * 100 : undefined, 1, false)}</span>
          </div>
          <div className="num text-right">{fmtMoney(v.marketValueBrl)}</div>
          <div className="num text-xs text-muted">
            <span className={flash(dir[p.quoteKey])} key={dir[p.quoteKey]?.n}>{fmtMoney(q?.price, p.currency)}</span>
            {" "}<span className={tone(q?.changePct)}>{fmtPct(q?.changePct)}</span>
          </div>
          <div className={`num text-xs text-right ${tone(v.unrealizedPnl)}`}>{fmtMoney(v.unrealizedPnl, p.currency)} · {fmtPct(v.unrealizedPct)}</div>
          <div className="num text-[11px] text-muted col-span-2">{fmtNum(p.quantity, 8)} a {fmtMoney(p.avgPrice, p.currency)}</div>
        </li>
      ))}
    </ul>
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
        <thead className="text-muted text-xs">
          <tr className="text-right">
            <th className="text-left font-normal py-2">Ativo</th>
            <th className="font-normal">Qtd</th>
            <th className="font-normal">Preço médio</th>
            <th className="font-normal">Cotação</th>
            <th className="font-normal">Dia</th>
            <th className="font-normal">Valor (R$)</th>
            <th className="font-normal">Resultado</th>
            <th className="font-normal">Peso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, q, v }) => (
            <tr key={p.assetId} className="border-t border-line text-right">
              <td className="text-left py-2">
                <Link href={`/ativos/${p.assetId}`} className="font-medium hover:underline">{p.ticker}</Link>
                <span className="block text-xs text-muted">
                  {ASSET_CLASS_LABEL[p.assetClass]}
                  {q && <> · {q.source === "lse-ws" ? "LSE ao vivo" : q.source === "lse-rest" ? "LSE" : q.delayed ? "Yahoo (15 min)" : "Yahoo"}</>}
                </span>
              </td>
              <td className="num">{fmtNum(p.quantity, 8)}</td>
              <td className="num">{fmtMoney(p.avgPrice, p.currency)}</td>
              <td className={`num ${flash(dir[p.quoteKey])}`} key={dir[p.quoteKey]?.n}>{fmtMoney(q?.price, p.currency)}</td>
              <td className={`num ${tone(q?.changePct)}`}>{fmtPct(q?.changePct)}</td>
              <td className="num">{fmtMoney(v.marketValueBrl)}</td>
              <td className={`num ${tone(v.unrealizedPnl)}`}>
                {fmtMoney(v.unrealizedPnl, p.currency)}
                <span className="block text-xs">{fmtPct(v.unrealizedPct)}</span>
              </td>
              <td className="num text-muted">{fmtPct(total ? ((v.marketValueBrl ?? v.costBrl) / total) * 100 : undefined, 1, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
