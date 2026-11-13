"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { describeAlert } from "@/lib/alerts";
import { fmtMoney } from "@/lib/format";

interface Row { id: string; type: string; target: number | null; threshold: number | null; triggeredAt: string | null; triggerPrice: number | null; seenAt: string | null; asset: { ticker: string; currency: string } }

interface Due { id: string; label: string; issuer: string; maturityDate: string; daysLeft: number }

/** Polls the alerts and shows fired ones until dismissed; also uses the browser notification when allowed. */
export function AlertToaster() {
  const [fired, setFired] = useState<Row[]>([]);
  const [due, setDue] = useState<Due[]>([]);
  const notified = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    const tick = () =>
      fetch("/api/alerts")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Row[]) => {
          if (stop) return;
          const open = rows.filter((a) => a.triggeredAt && !a.seenAt);
          setFired(open);
          for (const a of open) {
            if (notified.current.has(a.id)) continue;
            notified.current.add(a.id);
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`${a.asset.ticker} atingiu o alerta`, { body: `${fmtMoney(a.triggerPrice, a.asset.currency)}: ${describeAlert(a.type, a.threshold ?? a.target ?? undefined, (n) => fmtMoney(n, a.asset.currency))}` });
              }
            } catch {
              /* notifications are optional */
            }
          }
        })
        .catch(() => {});
    const tickDue = () =>
      fetch("/api/fixed-income/due")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Due[]) => {
          if (stop) return;
          setDue(rows);
          for (const d of rows) {
            if (notified.current.has("due:" + d.id)) continue;
            notified.current.add("due:" + d.id);
            try {
              if ("Notification" in window && Notification.permission === "granted") new Notification(`Vencimento: ${d.label}`, { body: dueText(d) });
            } catch {
              /* notifications are optional */
            }
          }
        })
        .catch(() => {});
    tick();
    tickDue();
    const t = setInterval(() => { tick(); tickDue(); }, 10_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const dismiss = (id: string) => {
    setFired((f) => f.filter((a) => a.id !== id));
    fetch(`/api/alerts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: true }) });
  };

  const dismissDue = (id: string) => {
    setDue((d) => d.filter((x) => x.id !== id));
    fetch(`/api/fixed-income/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seenDue: true }) });
  };

  if (!fired.length && !due.length) return null;
  return (
    <div className="fixed z-50 bottom-4 left-4 right-4 sm:left-auto sm:w-96 space-y-2" role="status" aria-live="polite">
      {due.map((d) => (
        <div key={d.id} className="card p-3 border-accent shadow-lg flex items-start gap-3 text-sm">
          <div className="flex-1">
            <p className="font-semibold">Vencimento: {d.label}</p>
            <p className="text-xs text-muted">{dueText(d)}</p>
          </div>
          <Link href="/renda-fixa" className="text-xs underline text-muted hover:text-fg">ver</Link>
          <button className="text-xs text-muted hover:text-fg" onClick={() => dismissDue(d.id)} aria-label="Dispensar">✕</button>
        </div>
      ))}
      {fired.map((a) => (
        <div key={a.id} className="card p-3 border-accent shadow-lg flex items-start gap-3 text-sm">
          <div className="flex-1">
            <p className="font-semibold">{a.asset.ticker} atingiu {fmtMoney(a.triggerPrice, a.asset.currency)}</p>
            <p className="text-xs text-muted">Alerta: {describeAlert(a.type, a.threshold ?? a.target ?? undefined, (n) => fmtMoney(n, a.asset.currency))}</p>
          </div>
          <Link href="/alertas" className="text-xs underline text-muted hover:text-fg">ver</Link>
          <button className="text-xs text-muted hover:text-fg" onClick={() => dismiss(a.id)} aria-label="Dispensar">✕</button>
        </div>
      ))}
    </div>
  );
}

function dueText(d: Due) {
  const dt = `${d.maturityDate.slice(8, 10)}/${d.maturityDate.slice(5, 7)}/${d.maturityDate.slice(0, 4)}`;
  return d.daysLeft < 0 ? `${d.issuer}: venceu em ${dt}. Marque como resgatada quando receber.` : d.daysLeft === 0 ? `${d.issuer}: vence hoje (${dt}).` : `${d.issuer}: vence em ${d.daysLeft} dia${d.daysLeft === 1 ? "" : "s"} (${dt}).`;
}
