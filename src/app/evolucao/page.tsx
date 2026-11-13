"use client";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtPct, tone } from "@/lib/format";
import type { EvPoint, Evolution } from "@/lib/evolution";

const RANGES = [
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 91 },
  { id: "6m", label: "6M", days: 182 },
  { id: "12m", label: "12M", days: 365 },
  { id: "all", label: "Tudo", days: Infinity },
] as const;

const SERIES = [
  { key: "carteira", label: "Carteira", color: "#3b82f6" },
  { key: "cdi", label: "CDI", color: "#f59e0b" },
  { key: "ibov", label: "Ibovespa", color: "#22c55e" },
  { key: "sp500", label: "S&P 500 (R$)", color: "#a855f7" },
] as const;

const tick = { fill: "#8b98a8", fontSize: 11 };
const tip = { background: "#121821", border: "1px solid #243040" };
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

export default function EvolucaoPage() {
  const [ev, setEv] = useState<Evolution | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("12m");
  const [withDivs, setWithDivs] = useState(true);

  const load = (refresh = false) => {
    setErr(null);
    if (refresh) setEv(null);
    fetch(`/api/evolution${refresh ? "?refresh=1" : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Erro");
        setEv(j);
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => load(), []);

  const view = useMemo(() => {
    if (!ev?.points.length) return null;
    const days = RANGES.find((r) => r.id === range)!.days;
    const last = ev.points[ev.points.length - 1];
    const cutoff = Number.isFinite(days) ? new Date(Date.parse(last.date) - days * 86_400_000).toISOString().slice(0, 10) : "";
    let pts = ev.points.filter((p) => p.date >= cutoff);
    if (!pts.length) pts = ev.points;
    const first = pts[0];
    const own = (p: EvPoint) => (withDivs ? p.twrTotal : p.twr);
    const rb = (v: number | undefined, b: number | undefined) => (v === undefined || b === undefined || !b ? undefined : (v / b - 1) * 100);
    const rows = pts.map((p) => ({
      date: p.date,
      holdings: p.holdings,
      invested: p.invested,
      carteira: rb(own(p), own(first)),
      cdi: rb(p.cdi, first.cdi),
      ibov: rb(p.ibov, first.ibov),
      sp500: rb(p.sp500, first.sp500),
    }));
    const step = Math.max(1, Math.ceil(rows.length / 220));
    const chart = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
    const end = rows[rows.length - 1];
    const gain = pts[pts.length - 1].holdings - first.holdings - (pts[pts.length - 1].invested - first.invested) + (withDivs ? pts[pts.length - 1].dividends - first.dividends : 0);
    return { chart, end, gain, from: first.date, to: last.date };
  }, [ev, range, withDivs]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold mr-auto">Evolução do patrimônio</h1>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={withDivs} onChange={(e) => setWithDivs(e.target.checked)} /> incluir proventos
        </label>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className={`btn-ghost text-sm !px-3 ${range === r.id ? "!bg-panel-2 text-fg" : "text-muted"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {err && <p className="text-down text-sm">{err}</p>}
      {!ev && !err && <p className="text-muted text-sm">Reconstruindo a carteira com preços históricos… (a primeira vez pode levar alguns segundos)</p>}
      {ev && !view && <p className="text-muted text-sm">{ev.warnings[0] ?? "Sem dados."} Lance transações para ver a evolução.</p>}

      {ev && view && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="card p-3 sm:p-4 col-span-2 lg:col-span-1">
              <p className="text-xs text-muted">Resultado no período</p>
              <p className={`num text-lg font-semibold mt-1 ${tone(view.gain)}`}>{fmtMoney(view.gain)}</p>
              <p className="text-[11px] text-muted mt-0.5">{fmtDate(view.from)} a {fmtDate(view.to)}</p>
            </div>
            {SERIES.map((s) => {
              const v = view.end[s.key];
              return (
                <div key={s.key} className="card p-3 sm:p-4">
                  <p className="text-xs text-muted flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</p>
                  <p className={`num text-lg font-semibold mt-1 ${tone(v)}`}>{fmtPct(v)}</p>
                </div>
              );
            })}
          </section>

          <section className="card p-2 sm:p-4 h-72">
            <h2 className="font-semibold text-sm px-2 sm:px-0 mb-1">Patrimônio × aportado (R$)</h2>
            <ResponsiveContainer height="88%">
              <LineChart data={view.chart} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="#243040" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={tick} tickFormatter={fmtDate} minTickGap={40} />
                <YAxis tick={tick} width={56} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => fmtMoney(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line name="Patrimônio" type="monotone" dataKey="holdings" stroke="#3b82f6" dot={false} strokeWidth={1.8} />
                <Line name="Aportado (líquido)" type="stepAfter" dataKey="invested" stroke="#8b98a8" dot={false} strokeWidth={1.4} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="card p-2 sm:p-4 h-80">
            <h2 className="font-semibold text-sm px-2 sm:px-0 mb-1">Rentabilidade no período (%)</h2>
            <ResponsiveContainer height="88%">
              <LineChart data={view.chart} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="#243040" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={tick} tickFormatter={fmtDate} minTickGap={40} />
                <YAxis tick={tick} width={48} tickFormatter={(v: number) => `${Math.round(v)}%`} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => fmtPct(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SERIES.map((s) => <Line key={s.key} name={s.label} type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={s.key === "carteira" ? 2.2 : 1.4} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </section>

          <div className="text-[11px] text-muted space-y-1">
            {ev.warnings.map((w) => <p key={w} className="text-yellow-400/90">{w}</p>)}
            <p>
              A rentabilidade da carteira é ponderada pelo tempo: aportes e retiradas não contam como ganho, então dá para comparar com os índices.
              Os preços históricos são do Yahoo (sem ajuste por eventos como desdobramentos) e o CDI vem do Banco Central. Ibovespa e S&P 500 são índices de preço, sem dividendos.
              O dólar usado em ativos americanos é o de fechamento de cada dia.
            </p>
            <button className="underline underline-offset-2 hover:text-fg" onClick={() => load(true)}>recalcular agora</button>
          </div>
        </>
      )}
    </div>
  );
}
