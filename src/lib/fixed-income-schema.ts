import { z } from "zod";
import { INDEXERS, KINDS } from "./fixed-income";

/** Shared by the create and update routes (route files may only export HTTP handlers). */
export const FixedIncomeBody = z
  .object({
    kind: z.enum(KINDS),
    issuer: z.string().trim().min(1, "Informe o banco/emissor").max(60),
    label: z.string().trim().max(60).nullable().optional(),
    indexer: z.enum(INDEXERS),
    rate: z.number(),
    principal: z.number().positive("O valor aplicado precisa ser maior que zero"),
    startDate: z.string().min(8),
    maturityDate: z.string().min(8),
    liquidity: z.enum(["DAILY", "MATURITY"]).default("MATURITY"),
    fgc: z.boolean().default(true),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .refine((d) => !Number.isNaN(+new Date(d.startDate)) && !Number.isNaN(+new Date(d.maturityDate)), { message: "Data inválida" })
  .refine((d) => new Date(d.maturityDate) > new Date(d.startDate), { message: "O vencimento precisa ser depois da aplicação" })
  .refine((d) => (d.indexer === "PRE" ? d.rate >= 0 && d.rate <= 100 : d.indexer === "CDI_PCT" ? d.rate >= 1 && d.rate <= 300 : d.rate >= -10 && d.rate <= 50), {
    message: "Taxa fora do intervalo esperado para esse indexador",
  });
