import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const db = (g.__prisma ??= new PrismaClient());
