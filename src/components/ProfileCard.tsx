"use client";
import { useEffect, useState } from "react";
import { OBJECTIVES, OBJECTIVE_LABEL, RISKS, RISK_LABEL, type Objective, type Risk } from "@/lib/profile";
import { parseQty } from "@/lib/format";


/** Investor profile used by the AI: risk, objective, horizon, concentration limit and free notes. */
export function ProfileCard() {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [f, setF] = useState({ risk: "MODERADO" as Risk, objective: "BALANCEADO" as Objective, horizonYears: "5", maxPositionPct: "", notes: "" });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((p: Partial<{ risk: Risk; objective: Objective; horizonYears: number; maxPositionPct: number | null; notes: string | null }>) => {
        if (p.risk && p.objective && p.horizonYears) {
          setSaved(true);
          setF({ risk: p.risk, objective: p.objective, horizonYears: String(p.horizonYears), maxPositionPct: p.maxPositionPct ? String(p.maxPositionPct) : "", notes: p.notes ?? "" });
        }
        setLoaded(true);
      });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(false);
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ risk: f.risk, objective: f.objective, horizonYears: Math.round(parseQty(f.horizonYears)), maxPositionPct: f.maxPositionPct ? parseQty(f.maxPositionPct) : null, notes: f.notes || null }),
    });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setSaved(true);
    setOk(true);
  };

  if (!loaded) return null;
  return (
    <section className="card p-4">
      <button className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-semibold">Seu perfil de investidor</span>
        <span className="text-xs text-muted">{saved ? `${RISK_LABEL[f.risk]} · ${OBJECTIVE_LABEL[f.objective]} · ${f.horizonYears} anos` : "não definido: a IA assume perfil moderado"} {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <form onSubmit={save} className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm items-end">
          <label className="block"><span className="text-xs text-muted block mb-1">Risco</span>
            <select className="input w-full" value={f.risk} onChange={(e) => setF({ ...f, risk: e.target.value as Risk })}>{RISKS.map((r) => <option key={r} value={r}>{RISK_LABEL[r]}</option>)}</select>
          </label>
          <label className="block"><span className="text-xs text-muted block mb-1">Objetivo</span>
            <select className="input w-full" value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value as Objective })}>{OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABEL[o]}</option>)}</select>
          </label>
          <label className="block"><span className="text-xs text-muted block mb-1">Horizonte (anos)</span>
            <input className="input w-full" inputMode="numeric" value={f.horizonYears} onChange={(e) => setF({ ...f, horizonYears: e.target.value })} required />
          </label>
          <label className="block"><span className="text-xs text-muted block mb-1">Máx. por ativo (%)</span>
            <input className="input w-full" inputMode="decimal" placeholder="ex.: 15" value={f.maxPositionPct} onChange={(e) => setF({ ...f, maxPositionPct: e.target.value })} />
          </label>
          <label className="block col-span-2 md:col-span-4"><span className="text-xs text-muted block mb-1">Observações (opcional, até 500 caracteres)</span>
            <textarea className="input w-full" rows={2} maxLength={500} placeholder="Ex.: não quero bancos; preciso de renda mensal a partir de 2028…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </label>
          <div className="col-span-2 md:col-span-4 flex items-center gap-3">
            <button className="btn">Salvar perfil</button>
            {ok && <span className="text-up text-sm">Salvo. Vale na próxima análise.</span>}
            {err && <span className="text-down text-sm">{err}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
