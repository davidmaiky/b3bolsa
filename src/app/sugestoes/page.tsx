"use client";
import { useEffect, useState } from "react";
import { SuggestionCard, type SuggestionRow } from "@/components/SuggestionCard";

export default function SugestoesPage() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => fetch("/api/suggestions").then((r) => r.json()).then(setRows);
  useEffect(() => { load(); }, []);

  const run = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Erro");
    load();
  };

  // latest suggestion per asset first, then history
  const latest = new Map<string, SuggestionRow>();
  for (const s of rows) if (!latest.has(s.asset.id)) latest.set(s.asset.id, s);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <h1 className="text-xl font-semibold">Sugestões de compra e venda</h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            O Gemini analisa cada ativo da carteira e da watchlist com P/L, P/VP, valor de Graham, critérios defensivos de Graham,
            preço teto de Bazin, ROE, endividamento, crescimento e momento técnico (cripto e moedas: momento e volatilidade).
          </p>
        </div>
        <button className="btn w-full sm:w-auto" onClick={run} disabled={busy}>{busy ? "Analisando…" : "Analisar carteira"}</button>
      </div>
      <p className="text-xs text-yellow-400/90 border border-yellow-500/30 bg-yellow-500/5 rounded-lg px-3 py-2">
        Conteúdo gerado por IA com dados possivelmente atrasados ou incompletos. Não é recomendação de investimento; decida com seu próprio julgamento ou com um profissional certificado.
      </p>
      {err && <p className="text-down text-sm">{err}</p>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...latest.values()].map((s) => <SuggestionCard key={s.id} s={s} />)}
      </div>
      {rows.length === 0 && !busy && <p className="text-muted text-sm">Nenhuma análise ainda.</p>}
    </div>
  );
}
