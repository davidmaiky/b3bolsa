"use client";
import { useCallback, useEffect, useState } from "react";
import { FGC_LIMIT, INDEXERS, INDEXER_LABEL, KINDS, KIND_LABEL, describeRate, rateHint, type Indexer, type Kind } from "@/lib/fixed-income";
import type { FixedIncomeRow, FixedIncomeSummary } from "@/lib/fixed-income-server";
import { fmtMoney, fmtPct, tone } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => Number(s.replace(",", "."));
const dateBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const emptyForm = { kind: "CDB" as Kind, issuer: "", label: "", indexer: "CDI_PCT" as Indexer, rate: "", principal: "", startDate: today(), maturityDate: "", liquidity: "MATURITY", fgc: true, note: "" };

export default function RendaFixaPage() {
  const [data, setData] = useState<{ items: FixedIncomeRow[]; summary: FixedIncomeSummary } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<{ id: string; date: string; net: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/fixed-income").then((r) => r.json()).then(setData).catch(() => setErr("Não foi possível carregar"));
  }, []);
  useEffect(load, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const body = {
      kind: form.kind, issuer: form.issuer, label: form.label || null, indexer: form.indexer, rate: num(form.rate), principal: num(form.principal),
      startDate: form.startDate, maturityDate: form.maturityDate, liquidity: form.liquidity, fgc: form.fgc, note: form.note || null,
    };
    const r = await fetch(editing ? `/api/fixed-income/${editing}` : "/api/fixed-income", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setEditing(null);
    setForm(emptyForm);
    load();
  };

  const startEdit = (i: FixedIncomeRow) => {
    setErr(null);
    setEditing(i.id);
    setForm({ kind: i.kind, issuer: i.issuer, label: i.label ?? "", indexer: i.indexer, rate: String(i.rate), principal: String(i.principal), startDate: i.startDate, maturityDate: i.maturityDate, liquidity: i.liquidity, fgc: i.fgc, note: i.note ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => { setEditing(null); setErr(null); setForm(emptyForm); };

  const redeem = async () => {
    if (!redeeming) return;
    setErr(null);
    const r = await fetch(`/api/fixed-income/${redeeming.id}/redeem`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: redeeming.date, ...(redeeming.net.trim() ? { net: num(redeeming.net) } : {}) }),
    });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setRedeeming(null);
    load();
  };
  const act = (url: string, init: RequestInit, ask?: string) => (!ask || confirm(ask)) && fetch(url, init).then(load);

  if (!data) return <p className="text-muted">{err ?? "Carregando…"}</p>;
  const { items, summary } = data;
  const active = items.filter((i) => !i.redeemedAt);
  const done = items.filter((i) => i.redeemedAt);
  const soon = active.filter((i) => i.value && !i.value.matured && i.value.daysToMaturity <= 30);
  const label = (i: FixedIncomeRow) => i.label || `${KIND_LABEL[i.kind]} ${i.issuer}`;
  const redeemingRow = redeeming ? items.find((i) => i.id === redeeming.id) : undefined;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Renda fixa</h1>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Aplicado" value={fmtMoney(summary.principal)} sub={`${summary.count} aplicaç${summary.count === 1 ? "ão" : "ões"}`} />
        <Kpi label="Valor bruto" value={fmtMoney(summary.gross)} />
        <Kpi label="Valor líquido estimado" value={fmtMoney(summary.net)} sub="após IR e IOF, se resgatasse hoje" />
        <Kpi label="Rendimento líquido" value={fmtMoney(summary.net - summary.principal)} sub={fmtPct(summary.principal ? ((summary.net - summary.principal) / summary.principal) * 100 : undefined)} t={summary.net - summary.principal} />
      </section>

      {!summary.cdiAvailable && <p className="text-xs text-yellow-400">Sem os dados do CDI (Banco Central) no momento: aplicações atreladas ao CDI aparecem pelo valor aplicado até a consulta funcionar.</p>}
      {summary.cdiStale && <p className="text-xs text-yellow-400">O Banco Central não respondeu: usei a última cópia do CDI guardada.</p>}
      {soon.length > 0 && (
        <p className="text-xs text-yellow-400">Vencem em até 30 dias: {soon.map((i) => `${label(i)} (${dateBr(i.maturityDate)})`).join("; ")}.</p>
      )}
      {summary.fgcAlerts.map((a) => (
        <p key={a.issuer} className="text-xs text-yellow-400">{a.issuer}: {fmtMoney(a.net)} com garantia do FGC, perto do limite de {fmtMoney(FGC_LIMIT)} por CPF e instituição.</p>
      ))}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">{editing ? "Editar aplicação" : "Nova aplicação"}</h2>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end text-sm">
          <F label="Tipo"><select className="input w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></F>
          <F label="Banco / emissor"><input className="input w-full" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} maxLength={60} required /></F>
          <F label="Apelido (opcional)"><input className="input w-full" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} /></F>
          <F label="Rentabilidade"><select className="input w-full" value={form.indexer} onChange={(e) => setForm({ ...form, indexer: e.target.value as Indexer })}>{INDEXERS.map((i) => <option key={i} value={i}>{INDEXER_LABEL[i]}</option>)}</select></F>
          <F label={`Taxa — ${rateHint(form.indexer)}`}><input className="input w-full" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required /></F>
          <F label="Valor aplicado (R$)"><input className="input w-full" inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} required /></F>
          <F label="Data da aplicação"><input className="input w-full" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></F>
          <F label="Vencimento"><input className="input w-full" type="date" value={form.maturityDate} onChange={(e) => setForm({ ...form, maturityDate: e.target.value })} required /></F>
          <F label="Liquidez"><select className="input w-full" value={form.liquidity} onChange={(e) => setForm({ ...form, liquidity: e.target.value })}><option value="MATURITY">No vencimento</option><option value="DAILY">Diária</option></select></F>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={form.fgc} onChange={(e) => setForm({ ...form, fgc: e.target.checked })} /> Coberto pelo FGC</label>
          <div className="col-span-2 flex gap-2">
            <button className="btn flex-1 md:flex-none">{editing ? "Salvar" : "Adicionar"}</button>
            {editing && <button type="button" className="btn-ghost" onClick={cancelEdit}>Cancelar</button>}
          </div>
        </form>
        {err && <p className="text-down text-sm">{err}</p>}
        <p className="text-[11px] text-muted">O valor é calculado pelas condições que você informa (curva do contrato), com IR regressivo e IOF; LCI, LCA, CRI e CRA são isentos de IR. É uma estimativa: o extrato do banco manda. Ainda não há IPCA+ nem Tesouro Direto.</p>
      </section>

      {redeemingRow && redeeming && (
        <section className="card p-4 space-y-3 border-accent">
          <h2 className="font-semibold">Resgatar: {label(redeemingRow)}</h2>
          <div className="flex items-end gap-3 flex-wrap text-sm">
            <F label="Data do resgate"><input className="input" type="date" value={redeeming.date} onChange={(e) => setRedeeming({ ...redeeming, date: e.target.value })} /></F>
            <F label="Valor líquido recebido (opcional)"><input className="input" inputMode="decimal" placeholder="deixe vazio para usar a estimativa" value={redeeming.net} onChange={(e) => setRedeeming({ ...redeeming, net: e.target.value })} /></F>
            <button className="btn" onClick={redeem}>Confirmar resgate</button>
            <button className="btn-ghost" onClick={() => setRedeeming(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Aplicações ativas</h2>
        <ul className="md:hidden divide-y divide-line text-sm">
          {active.map((i) => (
            <li key={i.id} className={`py-3 space-y-1 ${editing === i.id ? "bg-panel-2 -mx-2 px-2 rounded" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{label(i)}</span>
                <span className="num">{fmtMoney(i.value?.net ?? i.principal)}</span>
              </div>
              <div className="text-xs text-muted flex justify-between gap-3">
                <span>{i.issuer} · {describeRate(i.indexer, i.rate)}</span>
                <span className={tone(i.value?.netYieldPct)}>{i.value ? fmtPct(i.value.netYieldPct) : "—"}</span>
              </div>
              <div className="text-xs text-muted">Aplicado {fmtMoney(i.principal)} em {dateBr(i.startDate)} · vence {dateBr(i.maturityDate)}{i.value ? ` (${i.value.matured ? "vencida" : `${i.value.daysToMaturity} d`})` : ""}</div>
              <Actions i={i} onEdit={() => startEdit(i)} onRedeem={() => setRedeeming({ id: i.id, date: today(), net: "" })} onDelete={() => act(`/api/fixed-income/${i.id}`, { method: "DELETE" }, "Excluir esta aplicação?")} />
            </li>
          ))}
          {active.length === 0 && <li className="text-muted py-3">Nenhuma aplicação ativa.</li>}
        </ul>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
            <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Aplicação</th><th className="text-left font-normal">Rentabilidade</th><th className="font-normal">Aplicado</th><th className="font-normal">Bruto</th><th className="font-normal">Líquido</th><th className="font-normal">Rend. líq.</th><th className="font-normal">Vencimento</th><th /></tr></thead>
            <tbody>
              {active.map((i) => (
                <tr key={i.id} className={`border-t border-line text-right ${editing === i.id ? "bg-panel-2" : ""}`}>
                  <td className="text-left py-2"><span className="font-medium">{label(i)}</span><span className="block text-xs text-muted">{i.issuer}{i.fgc ? " · FGC" : ""}{i.liquidity === "DAILY" ? " · liquidez diária" : ""}</span></td>
                  <td className="text-left text-muted">{describeRate(i.indexer, i.rate)}</td>
                  <td className="num">{fmtMoney(i.principal)}</td>
                  <td className="num">{i.value ? fmtMoney(i.value.gross) : "—"}</td>
                  <td className="num">{fmtMoney(i.value?.net ?? i.principal)}</td>
                  <td className={`num ${tone(i.value?.netYieldPct)}`}>{i.value ? fmtPct(i.value.netYieldPct) : "—"}</td>
                  <td className="num">{dateBr(i.maturityDate)}<span className="block text-xs text-muted">{i.value ? (i.value.matured ? "vencida" : `${i.value.daysToMaturity} dias`) : ""}</span></td>
                  <td><Actions i={i} onEdit={() => startEdit(i)} onRedeem={() => setRedeeming({ id: i.id, date: today(), net: "" })} onDelete={() => act(`/api/fixed-income/${i.id}`, { method: "DELETE" }, "Excluir esta aplicação?")} /></td>
                </tr>
              ))}
              {active.length === 0 && <tr><td className="text-muted py-3" colSpan={8}>Nenhuma aplicação ativa.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {done.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Resgatadas</h2>
          <ul className="divide-y divide-line text-sm">
            {done.map((i) => (
              <li key={i.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <span className="font-medium">{label(i)}</span>
                  <span className="block text-xs text-muted">Aplicado {fmtMoney(i.principal)} em {dateBr(i.startDate)} · resgatado em {i.redeemedAt ? dateBr(i.redeemedAt) : ""}</span>
                </div>
                <span className={`num ${tone((i.redeemedNet ?? 0) - i.principal)}`}>{fmtMoney(i.redeemedNet)} <span className="text-xs">({fmtPct(i.principal ? (((i.redeemedNet ?? 0) - i.principal) / i.principal) * 100 : undefined)})</span></span>
                <button className="text-xs text-muted hover:text-fg" onClick={() => act(`/api/fixed-income/${i.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reopen: true }) }, "Reabrir esta aplicação?")}>reabrir</button>
                <button className="text-xs text-muted hover:text-down" onClick={() => act(`/api/fixed-income/${i.id}`, { method: "DELETE" }, "Excluir esta aplicação?")}>excluir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Actions({ i, onEdit, onRedeem, onDelete }: { i: FixedIncomeRow; onEdit: () => void; onRedeem: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-4 justify-end" data-id={i.id}>
      <button className="text-xs text-muted hover:text-fg py-1" onClick={onEdit}>editar</button>
      <button className="text-xs text-muted hover:text-fg py-1" onClick={onRedeem}>resgatar</button>
      <button className="text-xs text-muted hover:text-down py-1" onClick={onDelete}>excluir</button>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label>;
}

function Kpi({ label, value, sub, t }: { label: string; value: string; sub?: string; t?: number }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`num text-lg font-semibold mt-1 ${t === undefined ? "" : tone(t)}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
