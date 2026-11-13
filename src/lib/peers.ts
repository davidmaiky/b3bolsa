export interface PeerRow { ticker: string; sector?: string; pe?: number; pb?: number; dy?: number; roe?: number }

export interface PeerComparison {
  basis: "MESMO_SETOR" | "SEMELHANTES_YAHOO";
  sector?: string;
  peers: PeerRow[];
  median: { pe?: number; pb?: number; dy?: number; roe?: number };
  vsMedianPct: { pe?: number; pb?: number }; // negativo = mais barato que a mediana
  nota: string;
}

export function median(xs: (number | undefined)[]): number | undefined {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const pos = (x?: number) => (typeof x === "number" && x > 0 ? x : undefined);

/**
 * Compares an asset with its peers. Peers sharing the asset's sector are preferred (at least 2 needed);
 * otherwise the Yahoo "similar" list is used and flagged as such, since it can span other sectors.
 */
export function comparePeers(self: { pe?: number; pb?: number; sector?: string }, candidates: PeerRow[]): PeerComparison | null {
  const same = self.sector ? candidates.filter((c) => c.sector === self.sector) : [];
  const basis = same.length >= 2 ? "MESMO_SETOR" : "SEMELHANTES_YAHOO";
  const peers = basis === "MESMO_SETOR" ? same : candidates;
  if (peers.length < 2) return null;
  const med = { pe: median(peers.map((p) => pos(p.pe))), pb: median(peers.map((p) => pos(p.pb))), dy: median(peers.map((p) => p.dy)), roe: median(peers.map((p) => p.roe)) };
  const rel = (own: number | undefined, m: number | undefined) => (pos(own) && m ? (own! / m - 1) * 100 : undefined);
  return {
    basis,
    sector: self.sector,
    peers,
    median: med,
    vsMedianPct: { pe: rel(self.pe, med.pe), pb: rel(self.pb, med.pb) },
    nota:
      basis === "MESMO_SETOR"
        ? `Mediana de ${peers.length} empresas do mesmo setor (${self.sector}). Amostra pequena: use como referência.`
        : "Não há pares suficientes do mesmo setor: são ativos que o Yahoo considera semelhantes e podem ser de outros setores. Referência de mercado, não de setor.",
  };
}
