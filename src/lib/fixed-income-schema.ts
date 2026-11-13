import { z } from "zod";
import { INDEXERS, KINDS } from "./fixed-income";

/** Shared by the create and update routes (route files may only export HTTP handlers). */
export const FixedIncomeBody = z
  .object({
    kind: z.enum(KINDS),
    issuer: z.string().trim().min(1, "Informe o banco/emissor").max(60),
    label: z.string().trim().max(60).nullable().optional(),
    indexer: z.enum(INDEXERS),
    rate: z.number().default(0),
    principal: z.number().positive("O valor aplicado precisa ser maior que zero"),
    startDate: z.string().min(8),
    maturityDate: z.string().min(8),
    liquidity: z.enum(["DAILY", "MATURITY"]).default("MATURITY"),
    fgc: z.boolean().default(true),
    note: z.string().trim().max(300).nullable().optional(),
    tdTitle: z.string().trim().max(80).nullable().optional(),
    quantity: z.number().positive("Informe a quantidade de títulos").nullable().optional(),
  })
  .refine((d) => !Number.isNaN(+new Date(d.startDate)) && !Number.isNaN(+new Date(d.maturityDate)), { message: "Data inválida" })
  .refine((d) => new Date(d.maturityDate) > new Date(d.startDate), { message: "O vencimento precisa ser depois da aplicação" })
  .refine((d) => (d.kind === "TESOURO") === (d.indexer === "TESOURO"), { message: "Tesouro Direto usa a rentabilidade \"Tesouro (preço de mercado)\", e só ele" })
  .refine((d) => d.indexer !== "TESOURO" || (!!d.tdTitle && !!d.quantity), { message: "Escolha o título do Tesouro e informe a quantidade" })
  .refine(
    (d) =>
      d.indexer === "TESOURO" ? true
      : d.indexer === "PRE" ? d.rate >= 0 && d.rate <= 100
      : d.indexer === "CDI_PCT" ? d.rate >= 1 && d.rate <= 300
      : d.indexer === "CDI_PLUS" ? d.rate >= -10 && d.rate <= 50
      : d.rate >= -5 && d.rate <= 30,
    { message: "Taxa fora do intervalo esperado para esse indexador" },
  );

/** Prisma-ready fields: Tesouro is a public bond (no FGC) and has no contractual rate. */
export function toDb(d: ReturnType<typeof FixedIncomeBody.parse>) {
  const tesouro = d.indexer === "TESOURO";
  return {
    kind: d.kind, issuer: d.issuer, label: d.label || null, indexer: d.indexer, rate: tesouro ? 0 : d.rate, principal: d.principal,
    startDate: new Date(d.startDate), maturityDate: new Date(d.maturityDate), liquidity: d.liquidity, fgc: tesouro ? false : d.fgc,
    note: d.note || null, tdTitle: tesouro ? d.tdTitle ?? null : null, quantity: tesouro ? d.quantity ?? null : null,
  };
}
