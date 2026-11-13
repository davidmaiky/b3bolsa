import { describe, expect, it } from "vitest";
import { comparePeers, median } from "../peers";
import { profileForPrompt } from "../profile";

describe("peers", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([undefined, NaN])).toBeUndefined();
  });

  it("prefers same-sector peers and compares P/L and P/VP with the median", () => {
    const c = comparePeers(
      { pe: 6, pb: 1, sector: "Financial Services" },
      [
        { ticker: "A", sector: "Financial Services", pe: 8, pb: 1.5, dy: 0.06, roe: 0.18 },
        { ticker: "B", sector: "Financial Services", pe: 10, pb: 2, dy: 0.04, roe: 0.2 },
        { ticker: "C", sector: "Energy", pe: 50, pb: 9 },
      ],
    )!;
    expect(c.basis).toBe("MESMO_SETOR");
    expect(c.peers.map((p) => p.ticker)).toEqual(["A", "B"]);
    expect(c.median.pe).toBe(9);
    expect(c.vsMedianPct.pe).toBeCloseTo((6 / 9 - 1) * 100, 6); // mais barato que a mediana
    expect(c.vsMedianPct.pb).toBeCloseTo((1 / 1.75 - 1) * 100, 6);
  });

  it("falls back to Yahoo's similar list (flagged) when too few share the sector", () => {
    const c = comparePeers({ pe: 5, sector: "Energy" }, [{ ticker: "A", sector: "Basic Materials", pe: 10 }, { ticker: "B", sector: "Financial Services", pe: 20 }])!;
    expect(c.basis).toBe("SEMELHANTES_YAHOO");
    expect(c.nota).toContain("outros setores");
  });

  it("returns null without at least 2 peers and ignores non-positive multiples", () => {
    expect(comparePeers({ pe: 5 }, [{ ticker: "A", pe: 10 }])).toBeNull();
    const c = comparePeers({ pe: 5 }, [{ ticker: "A", pe: -3 }, { ticker: "B", pe: 10 }])!;
    expect(c.median.pe).toBe(10);
  });
});

describe("profileForPrompt", () => {
  it("serializes facts and omits when missing", () => {
    expect(profileForPrompt(null)).toBeNull();
    const j = JSON.parse(profileForPrompt({ risk: "CONSERVADOR", objective: "RENDA", horizonYears: 3, maxPositionPct: 15, notes: "sem bancos" })!);
    expect(j).toMatchObject({ perfil_de_risco: "Conservador", objetivo: "Renda (dividendos)", horizonte_anos: 3, concentracao_maxima_por_ativo_pct: 15, observacoes: "sem bancos" });
  });
});
