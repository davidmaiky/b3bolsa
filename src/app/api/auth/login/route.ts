import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, authEnabled, makeToken, safeEqual, sessionSecret, sha256Hex } from "@/lib/auth";

export const runtime = "nodejs";

const WINDOW_MS = 5 * 60_000;
const MAX_FAILS = 5;
const g = globalThis as unknown as { __loginFails?: Map<string, { n: number; reset: number }> };
const fails = (g.__loginFails ??= new Map());

export async function POST(req: NextRequest) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const f = fails.get(ip);
  if (f && f.reset > now && f.n >= MAX_FAILS) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers: { "retry-after": String(Math.ceil((f.reset - now) / 1000)) } });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const given = typeof body.password === "string" ? body.password : "";
  const ok = safeEqual(await sha256Hex(given), await sha256Hex(process.env.APP_PASSWORD!));
  if (!ok) {
    fails.set(ip, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + WINDOW_MS });
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }
  fails.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: await makeToken(sessionSecret()),
    httpOnly: true,
    sameSite: "lax",
    secure: (req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "")) === "https", // behind the proxy TLS ends before the app
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
