"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmtMoney, fmtNum } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";
import { AddAsset } from "@/components/AddAsset";

interface Asset { id: string; ticker: string; assetClass: AssetClass; currency: string }
interface Tx { id: string; type: string; quantity: number; price: number; fees: number; date: string; note: string | null; asset: Asset }

export default function TransacoesPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [form, setForm] = useState({ assetId: "", type: "BUY", quantity: "", price: "", fees: "0", date: new Date().toISOString().slice(0, 10), note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/assets").then((r) => r.json()).then((a: Asset[]) => {
      setAssets(a);
      setForm((f) => (f.assetId || !a[0] ? f : { ...f, assetId: a[0].id }));
    });
    fetch("/api/transactions").then((r) => r.json()).then(setTxs);
  }, []);
  useEffect(load, [load]);

  const num = (s: string) => Number(s.replace(",", "."));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const body = { type: form.type, quantity: num(form.quantity), price: num(form.price), fees: num(form.fees || "0"), date: form.date };
    const r = editing
      ? await fetch(`/api/transactions/${editing}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, assetId: form.assetId, note: form.note || undefined }) });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setEditing(null);
    setForm((f) => ({ ...f, quantity: "", price: "", fees: "0", note: "" }));
    load();
  };

  const startEdit = (t: Tx) => {
    setErr(null);
    setEditing(t.id);
    setForm({ assetId: t.asset.id, type: t.type, quantity: String(t.quantity), price: String(t.price), fees: String(t.fees), date: t.date.slice(0, 10), note: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => {
    setEditing(null);
    setErr(null);
    setForm((f) => ({ ...f, quantity: "", price: "", fees: "0", note: "" }));
  };
  const selected = assets.find((a) => a.id === form.assetId);

  return (
    <div className="space-y-6">
      <section className="card p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-semibold">{editing ? "Editar transação" : "Nova transação"}</h1>
          <AddAsset onAdded={load} />
        </div>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end text-sm">
          <Field label="Ativo">
            <select className="input w-full" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} disabled={!!editing} title={editing ? "O ativo não muda na edição: exclua e lance de novo se foi o ativo errado" : undefined} required>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.ticker} · {ASSET_CLASS_LABEL[a.assetClass]}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="input w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="BUY">Compra</option>
              <option value="SELL">Venda</option>
            </select>
          </Field>
          <Field label="Quantidade"><input className="input w-full" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></Field>
          <Field label={`Preço (${selected?.currency ?? ""})`}><input className="input w-full" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
          <Field label="Taxas"><input className="input w-full" inputMode="decimal" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} /></Field>
          <Field label="Data"><input className="input w-full" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
          <div className="col-span-2 md:col-span-1 flex gap-2 md:flex-col">
            <button className="btn flex-1 md:h-[34px]" disabled={!assets.length}>{editing ? "Salvar" : "Lançar"}</button>
            {editing && <button type="button" className="btn-ghost md:h-[34px]" onClick={cancelEdit}>Cancelar</button>}
          </div>
        </form>
        {err && <p className="text-down text-sm">{err}</p>}
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Histórico</h2>
        <ul className="md:hidden divide-y divide-line text-sm">
          {txs.map((t) => (
            <li key={t.id} className={`py-3 space-y-1 ${editing === t.id ? "bg-panel-2 -mx-2 px-2 rounded" : ""}`}>
              <div className="flex items-center gap-2">
                <Link className="font-medium hover:underline" href={`/ativos/${t.asset.id}`}>{t.asset.ticker}</Link>
                <span className={`text-xs ${t.type === "BUY" ? "text-up" : "text-down"}`}>{t.type === "BUY" ? "Compra" : "Venda"}</span>
                <span className="num text-xs text-muted ml-auto">{new Date(t.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="num text-muted text-xs">{fmtNum(t.quantity, 8)} × {fmtMoney(t.price, t.asset.currency)}{t.fees ? ` + ${fmtMoney(t.fees, t.asset.currency)} taxas` : ""}</span>
                <span className="num">{fmtMoney(t.quantity * t.price + (t.type === "BUY" ? t.fees : -t.fees), t.asset.currency)}</span>
              </div>
              <div className="flex gap-4">
                <button className="text-xs text-muted hover:text-fg py-1" onClick={() => startEdit(t)}>editar</button>
                <button className="text-xs text-muted hover:text-down py-1" onClick={() => confirm("Excluir transação?") && fetch(`/api/transactions/${t.id}`, { method: "DELETE" }).then(load)}>excluir</button>
              </div>
            </li>
          ))}
          {txs.length === 0 && <li className="text-muted py-3">Nenhuma transação.</li>}
        </ul>
        <table className="hidden md:table w-full text-sm">
          <thead className="text-muted text-xs"><tr className="text-right"><th className="text-left font-normal py-2">Data</th><th className="text-left font-normal">Ativo</th><th className="text-left font-normal">Tipo</th><th className="font-normal">Qtd</th><th className="font-normal">Preço</th><th className="font-normal">Taxas</th><th className="font-normal">Total</th><th /></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className={`border-t border-line text-right ${editing === t.id ? "bg-panel-2" : ""}`}>
                <td className="text-left py-2 num">{new Date(t.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                <td className="text-left"><Link className="hover:underline" href={`/ativos/${t.asset.id}`}>{t.asset.ticker}</Link></td>
                <td className={`text-left ${t.type === "BUY" ? "text-up" : "text-down"}`}>{t.type === "BUY" ? "Compra" : "Venda"}</td>
                <td className="num">{fmtNum(t.quantity, 8)}</td>
                <td className="num">{fmtMoney(t.price, t.asset.currency)}</td>
                <td className="num">{fmtMoney(t.fees, t.asset.currency)}</td>
                <td className="num">{fmtMoney(t.quantity * t.price + (t.type === "BUY" ? t.fees : -t.fees), t.asset.currency)}</td>
                <td className="whitespace-nowrap">
                  <button className="text-xs text-muted hover:text-fg mr-3" onClick={() => startEdit(t)}>editar</button>
                  <button className="text-xs text-muted hover:text-down" onClick={() => confirm("Excluir transação?") && fetch(`/api/transactions/${t.id}`, { method: "DELETE" }).then(load)}>excluir</button>
                </td>
              </tr>
            ))}
            {txs.length === 0 && <tr><td className="text-muted py-3" colSpan={8}>Nenhuma transação.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label>;
}
