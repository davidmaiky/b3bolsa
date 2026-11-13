export const RISKS = ["CONSERVADOR", "MODERADO", "ARROJADO"] as const;
export const OBJECTIVES = ["RENDA", "CRESCIMENTO", "BALANCEADO", "PRESERVACAO"] as const;
export type Risk = (typeof RISKS)[number];
export type Objective = (typeof OBJECTIVES)[number];

export const RISK_LABEL: Record<Risk, string> = { CONSERVADOR: "Conservador", MODERADO: "Moderado", ARROJADO: "Arrojado" };
export const OBJECTIVE_LABEL: Record<Objective, string> = {
  RENDA: "Renda (dividendos)",
  CRESCIMENTO: "Crescimento do patrimônio",
  BALANCEADO: "Balanceado",
  PRESERVACAO: "Preservação de capital",
};

export interface Profile {
  risk: Risk;
  objective: Objective;
  horizonYears: number;
  maxPositionPct: number | null;
  notes: string | null;
}

/** Instruction block appended to the user message. Facts only: the system prompt says how to use them. */
export function profileForPrompt(p: Profile | null | undefined): string | null {
  if (!p) return null;
  return JSON.stringify({
    perfil_de_risco: RISK_LABEL[p.risk],
    objetivo: OBJECTIVE_LABEL[p.objective],
    horizonte_anos: p.horizonYears,
    concentracao_maxima_por_ativo_pct: p.maxPositionPct,
    observacoes: p.notes,
  });
}
