"use client";
import { useEffect, useState } from "react";
import { ASSET_CLASS_LABEL, type AssetClass } from "@/lib/types";

interface Hit { ticker: string; name: string; assetClass: AssetClass }

export function AddAsset({ onAdded, watchlist = false }: { onAdded: () => void; watchlist?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [cls, setCls] = useState<AssetClass>("B3");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setHits(Array.isArray(d) ? d : []))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (h: { ticker: string; name?: string; assetClass: AssetClass }) => {
    setErr(null);
    const r = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...h, watchlist }) });
    if (!r.ok) return setErr((await r.json()).error ?? "Erro");
    setQ("");
    setHits([]);
    onAdded();
  };

  return (
    <div className="relative">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) add({ ticker: q.trim(), assetClass: cls });
        }}
      >
        <input className="input w-56" placeholder="Ticker ou nome (PETR4, AAPL, BTC, USD)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={cls} onChange={(e) => setCls(e.target.value as AssetClass)}>
          {Object.entries(ASSET_CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn" type="submit">{watchlist ? "Observar" : "Adicionar"}</button>
      </form>
      {err && <p className="text-down text-xs mt-1">{err}</p>}
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-[28rem] card overflow-hidden text-sm">
          {hits.map((h) => (
            <li key={h.assetClass + h.ticker}>
              <button className="w-full text-left px-3 py-2 hover:bg-panel-2 flex gap-2" onClick={() => add(h)}>
                <span className="font-medium w-20">{h.ticker}</span>
                <span className="text-muted truncate flex-1">{h.name}</span>
                <span className="text-xs text-muted">{ASSET_CLASS_LABEL[h.assetClass]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
