/**
 * Single-password access control. Works in the Edge runtime (middleware) and in Node:
 * only Web Crypto is used. A session cookie is `${expiresAtMs}.${hmac}`; the HMAC key mixes
 * AUTH_SECRET with the password, so changing either one signs everybody out.
 */
export const SESSION_COOKIE = "carteira_session";
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const authEnabled = () => !!process.env.APP_PASSWORD;
export const sessionSecret = () => `${process.env.AUTH_SECRET ?? ""}:${process.env.APP_PASSWORD ?? ""}`;

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/** Constant-time string comparison (length is not secret here: both sides are fixed-size hex). */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sha256Hex(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function makeToken(secret: string, now = Date.now(), ttl = SESSION_TTL_MS) {
  const exp = String(now + ttl);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifyToken(secret: string, token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || +exp < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

/** Only same-site relative paths are allowed as a post-login destination. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");
