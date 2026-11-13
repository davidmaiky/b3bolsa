"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLivePrices } from "@/hooks/useLivePrices";
import { ALERT_LABEL, ALERT_TYPES, describeAlert, isDynamic, type AlertType } from "@/lib/alerts";
import { fmtMoney, fmtPct } from "@/lib/format";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";

interface Asset { id: string; ticker: string; assetClass: AssetClass; currency: string }
interface Row {
  id: string; type: AlertType; target: number | null; threshold: number | null; price: number | null; note: string | null;
  active: boolean; triggeredAt: string | null; triggerPrice: number | null; createdAt: string;
  asset: Asset;
}

const num = (s: string) => Number(s.replace(",", "."));

export default function AlertasPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ assetId: "", type: "BELOW" as AlertType, target: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<string>("unsupported");
  const { quotes } = useLivePrices();

  const load = useCallback(() => {
    fetch("/api/alerts").then((r) => r.json()).then(setRows);
    fetch("/api/assets").then((r) => r.json()).then((a: Asset[]) => {
      setAssets(a);
      setForm((f) => (f.assetId || !a[0] ? f : { ...f, assetId: a[0].id }));
    });
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    fetch("/api/status").then((r) => r.json()).then((s) => setTelegram(!!s.telegramConfigured)).catch(() => {});
    if ("Notification" in window) setPerm(Notification.permission);
    return () => clearInterval(t);
  }, [load]);

  const selected = assets.find((a) => a.id === form.assetId);
  const livePrice = selected ? quotes[`${selected.ticker.toUpperCase()}:${selected.assetClass}`]?.price : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId: form.assetId, type: form.type, target: isDynamic(form.type) ? undefined : num(form.target), note: form.note || undefined }),
    });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setForm((f) => ({ ...f, target: "", note: "" }));
    load();
  };
  const patch = (id: string, body: object) => fetch(`/api/alerts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(load);
  const del = (id: string) => confirm("Excluir alerta?") && fetch(`/api/alerts/${id}`, { method: "DELETE" }).then(load);

  const armed = rows.filter((r) => r.active);
  const fired = rows.filter((r) => !r.active && r.triggeredAt);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Alertas de preço</h1>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Novo alerta</h2>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end text-sm">
          <label className="block col-span-2 md:col-span-1"><span className="text-xs text-muted block mb-1">Ativo</span>
            <select className="input w-full" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.ticker} · {ASSET_CLASS_LABEL[a.assetClass]}</option>)}
            </select>
          </label>
          <label className="block col-span-2 md:col-span-1"><span className="text-xs text-muted block mb-1">Quando</span>
            <select className="input w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AlertType })}>
              {ALERT_TYPES.map((t) => <option key={t} value={t}>{ALERT_LABEL[t]}</option>)}
            </select>
          </label>
          {!isDynamic(form.type) && (
            <label className="block"><span className="text-xs text-muted block mb-1">Preço ({selected?.currency ?? ""}){livePrice !== undefined ? ` · agora ${fmtMoney(livePrice, selected?.currency)}` : ""}</span>
              <input className="input w-full" inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required />
            </label>
          )}
          <label className="block"><span className="text-xs text-muted block mb-1">Nota (opcional)</span>
            <input className="input w-full" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={200} />
          </label>
          <button className="btn col-span-2 md:col-span-1 md:h-[34px]" disabled={!assets.length}>Criar alerta</button>
        </form>
        {err && <p className="text-down text-sm">{err}</p>}
        {!assets.length && <p className="text-muted text-xs">Adicione ativos na Carteira ou na watchlist para criar alertas.</p>}
        <p className="text-[11px] text-muted">Cada alerta dispara uma vez; depois você pode rearmá-lo. Os níveis de Bazin e Graham vêm dos fundamentos (ações com dividendos ou LPA/VPA). O servidor precisa estar ligado para monitorar.</p>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Como avisar</h2>
        <ul className="text-sm text-muted space-y-1 list-disc pl-5">
          <li>Aviso na tela, com um aviso fixo até você dispensar.</li>
          <li>
            Notificação do navegador:{" "}
            {perm === "unsupported" ? "indisponível neste navegador." : perm === "granted" ? "ativada." : perm === "denied" ? "bloqueada nas configurações do navegador." : (
              <button className="underline hover:text-fg" onClick={() => Notification.requestPermission().then(setPerm)}>ativar</button>
            )}
          </li>
          <li>Telegram: {telegram === null ? "…" : telegram ? "configurado." : <>não configurado. Crie um bot no @BotFather e preencha <code>TELEGRAM_BOT_TOKEN</code> e <code>TELEGRAM_CHAT_ID</code> no <code>.env</code> (veja o README).</>}</li>
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Armados</h2>
        <ul className="divide-y divide-line text-sm">
          {armed.map((a) => {
            const dist = a.price && a.threshold ? (a.threshold / a.price - 1) * 100 : undefined;
            return (
              <li key={a.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Link href={`/ativos/${a.asset.id}`} className="font-medium hover:underline">{a.asset.ticker}</Link>{" "}
                  <span className="text-muted">{describeAlert(a.type, a.threshold ?? undefined, (n) => fmtMoney(n, a.asset.currency))}</span>
                  {a.note && <span className="block text-xs text-muted">{a.note}</span>}
                </div>
                <div className="num text-xs text-muted text-right">
                  agora {fmtMoney(a.price, a.asset.currency)}
                  <span className="block">{dist !== undefined ? `faltam ${fmtPct(dist, 1)}` : a.threshold === null ? "calculando nível…" : ""}</span>
                </div>
                <button className="text-xs text-muted hover:text-down" onClick={() => del(a.id)}>excluir</button>
              </li>
            );
          })}
          {armed.length === 0 && <li className="text-muted py-2">Nenhum alerta armado.</li>}
        </ul>
      </section>

      {fired.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Disparados</h2>
          <ul className="divide-y divide-line text-sm">
            {fired.map((a) => (
              <li key={a.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Link href={`/ativos/${a.asset.id}`} className="font-medium hover:underline">{a.asset.ticker}</Link>{" "}
                  <span className="text-muted">{describeAlert(a.type, a.threshold ?? a.target ?? undefined, (n) => fmtMoney(n, a.asset.currency))}</span>
                  <span className="block text-xs text-up">chegou a {fmtMoney(a.triggerPrice, a.asset.currency)} em {a.triggeredAt ? new Date(a.triggeredAt).toLocaleString("pt-BR") : ""}</span>
                </div>
                <button className="btn-ghost text-xs" onClick={() => patch(a.id, { active: true })}>Rearmar</button>
                <button className="text-xs text-muted hover:text-down" onClick={() => del(a.id)}>excluir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
