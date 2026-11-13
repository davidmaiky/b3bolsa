import { GoogleGenAI } from "@google/genai";
import type { AssetAnalysis } from "../analysis";

export interface LlmSuggestion {
  ticker: string;
  acao: "COMPRAR" | "MANTER" | "VENDER";
  confianca: number; // 0..1
  preco_alvo: number | null;
  justificativa: string;
  riscos: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    sugestoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          acao: { type: "string", enum: ["COMPRAR", "MANTER", "VENDER"] },
          confianca: { type: "number", minimum: 0, maximum: 1 },
          preco_alvo: { type: ["number", "null"] },
          justificativa: { type: "string" },
          riscos: { type: "array", items: { type: "string" } },
        },
        required: ["ticker", "acao", "confianca", "preco_alvo", "justificativa", "riscos"],
      },
    },
  },
  required: ["sugestoes"],
};

const SYSTEM = `Você é um analista fundamentalista que escreve em português do Brasil.
Para cada ativo, recomende COMPRAR, MANTER ou VENDER usando SOMENTE os dados fornecidos.

Ações (B3 e EUA) — pese nesta ordem:
1. Valor intrínseco de Graham √(22,5·LPA·VPA) e margem de segurança (≥ 25% é atrativo; negativo é caro).
2. Critérios defensivos de Graham (P/L ≤ 15, P/VP ≤ 1,5, P/L×P/VP ≤ 22,5, liquidez corrente, lucro positivo).
3. Preço teto de Bazin (DPA/6%) para pagadoras de dividendos.
4. Qualidade: ROE, margem líquida, dívida/PL, crescimento de lucro, PEG, EV/EBITDA.
5. Momento técnico apenas como desempate (RSI, distância da MM200, retornos).
Setores com LPA cíclico (commodities, bancos) ou LPA negativo exigem cautela: Graham não se aplica com LPA ≤ 0.

Criptomoedas e moedas não têm fundamentos de lucro: use momento (retornos 30/90/365d), volatilidade,
RSI (>70 sobrecomprado, <30 sobrevendido), distância da MM200 e o peso na carteira; seja conservador.

Se o investidor já tem posição, considere o preço médio e o ganho/perda não realizado ao sugerir realizar lucro ou aumentar.
Quando faltarem dados, diga isso e reduza a confiança. preco_alvo é o preço justo estimado na moeda do ativo, ou null.
Justificativa: 2–4 frases citando os números. Nunca invente números que não estão nos dados.`;

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY?.trim();
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

const round = (_k: string, v: unknown) => (typeof v === "number" ? Number(v.toPrecision(5)) : v);

export async function suggest(
  analyses: AssetAnalysis[],
  portfolioContext: { totalBrl: number; weights: Record<string, number>; classAllocation?: { classe: string; atual_pct: number; meta_pct: number }[] },
): Promise<LlmSuggestion[]> {
  if (!geminiConfigured()) throw new Error("Configure GEMINI_API_KEY no arquivo .env");
  // preview models are only served on v1beta
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { apiVersion: "v1beta" } });
  const payload = analyses.map((a) => ({
    ...a,
    peso_na_carteira_pct: portfolioContext.weights[a.ticker] ?? 0,
  }));
  const res = await ai.models.generateContent({
    model: geminiModel(),
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Data: ${new Date().toISOString().slice(0, 10)}. Patrimônio total: R$ ${portfolioContext.totalBrl.toFixed(2)}.\n` +
              (portfolioContext.classAllocation?.length
                ? `Meta de alocação do investidor por classe (use para favorecer compras em classes abaixo da meta e cautela em classes acima): ${JSON.stringify(portfolioContext.classAllocation, round)}.\n`
                : "") +
              `Dados dos ativos (frações: 0.08 = 8%; valuation.score é um placar por regras de -100 a 100):\n` +
              JSON.stringify(payload, round),
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      temperature: 0.2,
    },
  });
  const text = res.text ?? "";
  const parsed = JSON.parse(text) as { sugestoes: LlmSuggestion[] };
  return parsed.sugestoes;
}
