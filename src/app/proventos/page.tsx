"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { DIVIDEND_LABEL, DIVIDEND_TYPES, JCP_TAX_RATE, monthlyNet, netOf, netSince, yieldOnCost } from "@/lib/dividends";
import { fmtMoney, fmtNum, fmtPct, parseMoney, parseQty, parseNumber } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";
import type { PositionRow } from "@/lib/server-portfolio";
import { hasFundamentals, isB3Listed } from "@/lib/classify";

interface Asset { id: string; ticker: string; assetClass: AssetClass; currency: string }
interface Div { id: string; type: string; date: string; perShare: number; quantity: number; tax: number; source: string; note: string | null; asset: Asset }

const today = () => new Date().toISOString().slice(0, 10);

export default function ProventosPage() {
  const [divs, setDivs] = useState<Div[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [form, setForm] = useState({ assetId: "", type: "DIVIDENDO", date: today(), perShare: "", quantity: "", tax: "", note: "" });
  const [taxTouched, setTaxTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { quotes } = useLivePrices();
  const fx = quotes["USD:FX"]?.price;

  const load = useCallback(() => {
    fetch("/api/dividends").then((r) => r.json()).then(setDivs);
    fetch("/api/portfolio").then((r) => r.json()).then((d) => setPositions(d.positions));
  }, []);
  useEffect(load, [load]);

  const payers = positions.filter((p) => hasFundamentals(p.assetClass));
  const rate = (cur: string) => (cur === "USD" ? fx ?? NaN : 1);

  // default asset + quantity = current position
  useEffect(() => {
    if (!form.assetId && payers[0]) setForm((f) => ({ ...f, assetId: payers[0].assetId, quantity: String(payers[0].quantity || "") }));
  }, [payers, form.assetId]);

  // JCP: suggest the 15% withholding until the user edits the field
  useEffect(() => {
    if (taxTouched) return;
    const gross = parseQty(form.perShare || "0") * parseQty(form.quantity || "0");
    setForm((f) => ({ ...f, tax: form.type === "JCP" && gross > 0 ? (gross * JCP_TAX_RATE).toFixed(2) : "" }));
  }, [form.type, form.perShare, form.quantity, taxTouched]);

  const selected = payers.find((p) => p.assetId === form.assetId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/dividends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, perShare: parseQty(form.perShare), quantity: parseNumber(form.quantity, isB3Listed(selected?.assetClass ?? "")), tax: parseMoney(form.tax || "0"), note: form.note || undefined }),
    });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setForm((f) => ({ ...f, perShare: "", tax: "", note: "" }));
    setTaxTouched(false);
    load();
  };

  const importYahoo = async () => {
    setImporting(true);
    setMsg(null);
    const r = await fetch("/api/dividends/import", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await r.json();
    setImporting(false);
    setMsg(r.ok ? `${d.added} provento(s) importado(s) de ${d.checked} ativo(s).${d.errors?.length ? ` Falhas: ${d.errors.join("; ")}` : ""}` : d.error ?? "Erro");
    load();
  };

  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const items = useMemo(() => divs.map((d) => ({ d, net: netOf(d), netBrl: netOf(d) * rate(d.asset.currency) })), [divs, fx]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalBrl = items.reduce((s, i) => s + finite(i.netBrl), 0);
  const last12 = items.filter((i) => netSince([i.d]) > 0).reduce((s, i) => s + finite(i.netBrl), 0);
  const heldCostBrl = positions.filter((p) => p.quantity > 0).reduce((s, p) => s + finite(p.cost * rate(p.currency)), 0);
  const chart = monthlyNet(items.map((i) => ({ date: i.d.date, net: finite(i.netBrl) })));

  const byAsset = payers
    .map((p) => ({ p, total: p.dividendsNetTotal, y12: p.dividendsNet12m, yoc: yieldOnCost(p.dividendsNet12m, p.cost) }))
    .filter((r) => r.total > 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total recebido" value={fmtMoney(totalBrl)} />
        <Kpi label="Últimos 12 meses" value={fmtMoney(last12)} />
        <Kpi label="Média mensal (12m)" value={fmtMoney(last12 / 12)} />
        <Kpi label="Yield on cost (12m)" value={fmtPct(yieldOnCost(last12, heldCostBrl), 2, false)} sub="sobre o custo da carteira atual" />
      </section>

      <section className="card p-4 h-64 sm:h-72">
        <h2 className="font-semibold mb-2">Proventos por mês (R$, líquido)</h2>
        <ResponsiveContainer height="90%">
          <BarChart data={chart} margin={{ left: 0, right: 8 }}>
            <XAxis dataKey="month" tick={{ fill: "#8b98a8", fontSize: 11 }} tickFormatter={(m: string) => `${m.slice(5)}/${m.slice(2, 4)}`} />
            <YAxis tick={{ fill: "#8b98a8", fontSize: 11 }} width={52} />
            <Tooltip contentStyle={{ background: "#121821", border: "1px solid #243040" }} formatter={(v) => fmtMoney(Number(v))} cursor={{ fill: "rgba(255,255,255,.05)" }} />
            <Bar dataKey="value" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold">Lançar provento</h2>
          <button className="btn-ghost text-sm w-full sm:w-auto" onClick={importYahoo} disabled={importing}>{importing ? "Importando…" : "Importar do Yahoo"}</button>
        </div>
        {msg && <p className="text-xs text-muted">{msg}</p>}
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end text-sm">
          <Field label="Ativo">
            <select className="input w-full" value={form.assetId} onChange={(e) => { const p = payers.find((x) => x.assetId === e.target.value); setForm({ ...form, assetId: e.target.value, quantity: String(p?.quantity || "") }); }} required>
              {payers.map((p) => <option key={p.assetId} value={p.assetId}>{p.ticker}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input w-full" value={form.type} onChange={(e) => { setTaxTouched(false); setForm({ ...form, type: e.target.value }); }}>
              {DIVIDEND_TYPES.map((t) => <option key={t} value={t}>{DIVIDEND_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Data"><input className="input w-full" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
          <Field label={`Por cota (${selected?.currency ?? ""})`}><input className="input w-full" inputMode="decimal" value={form.perShare} onChange={(e) => setForm({ ...form, perShare: e.target.value })} required /></Field>
          <Field label="Quantidade"><input className="input w-full" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></Field>
          <Field label="IR retido"><input className="input w-full" inputMode="decimal" value={form.tax} onChange={(e) => { setTaxTouched(true); setForm({ ...form, tax: e.target.value }); }} /></Field>
          <button className="btn col-span-2 md:col-span-1 md:h-[34px]" disabled={!payers.length}>Lançar</button>
        </form>
        {err && <p className="text-down text-sm">{err}</p>}
        {!payers.length && <p className="text-muted text-xs">Adicione ações da B3 ou dos EUA na Carteira para lançar proventos.</p>}
        <p className="text-[11px] text-muted">JCP vem com 15% de IR sugerido. O importador do Yahoo usa a data ex e o valor bruto, sem imposto: ajuste se precisar do líquido.</p>
      </section>

      {byAsset.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Por ativo</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
              <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Ativo</th><th className="font-normal">Total líquido</th><th className="font-normal">12 meses</th><th className="font-normal">Yield on cost</th></tr></thead>
              <tbody>
                {byAsset.map(({ p, total, y12, yoc }) => (
                  <tr key={p.assetId} className="border-t border-line text-right">
                    <td className="text-left py-2"><Link className="font-medium hover:underline" href={`/ativos/${p.assetId}`}>{p.ticker}</Link> <span className="text-xs text-muted">{ASSET_CLASS_LABEL[p.assetClass]}</span></td>
                    <td className="num">{fmtMoney(total, p.currency)}</td>
                    <td className="num">{fmtMoney(y12, p.currency)}</td>
                    <td className="num">{fmtPct(yoc, 2, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Histórico</h2>
        <ul className="md:hidden divide-y divide-line text-sm">
          {divs.map((d) => (
            <li key={d.id} className="py-3 space-y-1">
              <div className="flex items-center gap-2">
                <Link className="font-medium hover:underline" href={`/ativos/${d.asset.id}`}>{d.asset.ticker}</Link>
                <span className="text-xs text-muted">{DIVIDEND_LABEL[d.type] ?? d.type}</span>
                <span className="num text-xs text-muted ml-auto">{new Date(d.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="num text-muted text-xs">{fmtNum(d.quantity, 8)} × {fmtMoney(d.perShare, d.asset.currency)}{d.tax ? ` − ${fmtMoney(d.tax, d.asset.currency)} IR` : ""}</span>
                <span className="num text-up">{fmtMoney(netOf(d), d.asset.currency)}</span>
              </div>
              <button className="text-xs text-muted hover:text-down py-1" onClick={() => confirm("Excluir provento?") && fetch(`/api/dividends/${d.id}`, { method: "DELETE" }).then(load)}>excluir</button>
            </li>
          ))}
          {divs.length === 0 && <li className="text-muted py-3">Nenhum provento lançado.</li>}
        </ul>
        <table className="hidden md:table w-full text-sm">
          <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Data</th><th className="text-left font-normal">Ativo</th><th className="text-left font-normal">Tipo</th><th className="font-normal">Qtd</th><th className="font-normal">Por cota</th><th className="font-normal">IR</th><th className="font-normal">Líquido</th><th /></tr></thead>
          <tbody>
            {divs.map((d) => (
              <tr key={d.id} className="border-t border-line text-right" title={d.note ?? undefined}>
                <td className="text-left py-2 num">{new Date(d.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="text-left"><Link className="hover:underline" href={`/ativos/${d.asset.id}`}>{d.asset.ticker}</Link></td>
                <td className="text-left text-muted">{DIVIDEND_LABEL[d.type] ?? d.type}{d.source === "yahoo" ? " · Yahoo" : ""}</td>
                <td className="num">{fmtNum(d.quantity, 8)}</td>
                <td className="num">{fmtMoney(d.perShare, d.asset.currency)}</td>
                <td className="num">{fmtMoney(d.tax, d.asset.currency)}</td>
                <td className="num text-up">{fmtMoney(netOf(d), d.asset.currency)}</td>
                <td><button className="text-xs text-muted hover:text-down" onClick={() => confirm("Excluir provento?") && fetch(`/api/dividends/${d.id}`, { method: "DELETE" }).then(load)}>excluir</button></td>
              </tr>
            ))}
            {divs.length === 0 && <tr><td className="text-muted py-3" colSpan={8}>Nenhum provento lançado.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label>;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-lg font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
