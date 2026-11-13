import { GoogleGenAI } from "@google/genai";
import type { AssetAnalysis } from "../analysis";
import { modelChain, runWithFallback, type Attempt } from "./fallback";
import { profileForPrompt, type Profile } from "../profile";

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

FIIs (classe FII): NÃO use Graham, Bazin nem P/L, que não fazem sentido para fundos. Use o bloco "fii": P/VP e "discountPct" (negativo = desconto ao valor patrimonial), dividend yield mensal e de 12 meses, regularidade ("paymentMonths12" de 12), tendência dos rendimentos ("dividendTrendPct"), vacância física e financeira e segmento (a vacância é informada pelo investidor: se ausente, diga que não foi informada e reduza a confiança). Fundos de papel (CRI) pedem P/VP perto de 1 e atenção ao risco de crédito; fundos de tijolo pedem vacância baixa. Rendimentos de FII são isentos de IR para pessoa física; o ganho de capital paga 20%. Você não tem a Selic nem o CDI: não invente comparações com renda fixa.
ETFs (classe ETF): não têm fundamentos de lucro; use momento, volatilidade, RSI, distância da MM200, peso na carteira e o perfil do investidor, como nas criptomoedas.

Criptomoedas e moedas não têm fundamentos de lucro: use momento (retornos 30/90/365d), volatilidade,
RSI (>70 sobrecomprado, <30 sobrevendido), distância da MM200 e o peso na carteira; seja conservador.

Comparação com pares: quando houver "peers", compare o P/L e o P/VP do ativo com a mediana dos pares ("vsMedianPct" negativo = mais barato que a mediana; "median.dy" e "median.roe" servem para dividendos e qualidade).
Se "basis" for SEMELHANTES_YAHOO, os pares NÃO são necessariamente do mesmo setor: dê peso pequeno e diga isso. Poucos pares ou ausência de "peers" reduzem a confiança nessa parte.

Perfil do investidor (quando fornecido) manda no ajuste final:
- CONSERVADOR: priorize qualidade, dividendos recorrentes e baixa volatilidade; seja cético com cripto e ativos muito voláteis. ARROJADO tolera mais volatilidade e crescimento caro.
- Objetivo RENDA favorece boas pagadoras (Bazin, dividend yield); CRESCIMENTO tolera P/L maior se houver crescimento; PRESERVACAO prioriza segurança e margem de segurança; BALANCEADO equilibra.
- Horizonte curto (menos de 3 anos) penaliza ativos voláteis e teses de longo prazo.
- Se "peso_na_carteira_pct" já passa de "concentracao_maxima_por_ativo_pct", não recomende comprar mais e considere reduzir, qualquer que seja a tese.
- Cite o perfil na justificativa sempre que ele mudar a recomendação.

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

export interface SuggestResult { items: LlmSuggestion[]; model: string; attempts: Attempt[] }

const CALL_TIMEOUT_MS = 90_000;

export async function suggest(
  analyses: AssetAnalysis[],
  ctx: {
    totalBrl: number;
    weights: Record<string, number>;
    classAllocation?: { classe: string; atual_pct: number; meta_pct: number }[];
    profile?: Profile | null;
  },
): Promise<SuggestResult> {
  if (!geminiConfigured()) throw new Error("Configure GEMINI_API_KEY no arquivo .env");
  // preview models are only served on v1beta
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { apiVersion: "v1beta" } });
  const payload = analyses.map((a) => ({ ...a, peso_na_carteira_pct: ctx.weights[a.ticker] ?? 0 }));
  const profile = profileForPrompt(ctx.profile);
  const text =
    `Data: ${new Date().toISOString().slice(0, 10)}. Patrimônio total: R$ ${ctx.totalBrl.toFixed(2)}.\n` +
    (profile ? `Perfil do investidor: ${profile}.\n` : "Perfil do investidor: não informado (assuma perfil moderado e diga que assumiu).\n") +
    (ctx.classAllocation?.length
      ? `Meta de alocação do investidor por classe (use para favorecer compras em classes abaixo da meta e cautela em classes acima): ${JSON.stringify(ctx.classAllocation, round)}.\n`
      : "") +
    `Dados dos ativos (frações: 0.08 = 8%; valuation.score é um placar por regras de -100 a 100):\n` +
    JSON.stringify(payload, round);

  const call = async (model: string) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error("timeout: o modelo demorou demais")), CALL_TIMEOUT_MS);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text }] }],
        config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: SCHEMA, temperature: 0.2, abortSignal: ctl.signal },
      });
      const parsed = JSON.parse(res.text ?? "") as { sugestoes?: LlmSuggestion[] };
      if (!Array.isArray(parsed.sugestoes)) throw new Error("resposta sem a lista de sugestões");
      return parsed.sugestoes;
    } finally {
      clearTimeout(timer);
    }
  };

  const { result, model, attempts } = await runWithFallback(modelChain(geminiModel(), process.env.GEMINI_FALLBACK_MODELS), call);
  return { items: result, model, attempts };
}
