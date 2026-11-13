import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, sessionSecret, verifyToken } from "@/lib/auth";

const PUBLIC_FILES = new Set(["/api/health", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icon.png"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // public: health probe and the files the browser fetches without cookies to install the app
  if (PUBLIC_FILES.has(pathname) || pathname.startsWith("/icons/")) return NextResponse.next();

  if (!authEnabled()) {
    // In production the site must not be open by accident: refuse to serve until a password is set.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_NO_AUTH !== "1") {
      return new NextResponse("Defina a variável APP_PASSWORD para liberar o acesso (ou ALLOW_NO_AUTH=1 para rodar sem senha).", { status: 503 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (await verifyToken(sessionSecret(), req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  // Next needs an absolute URL; behind a reverse proxy the public host/protocol come from the forwarded headers
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || req.nextUrl.host;
  const url = new URL(`${proto}://${host}/login`);
  if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
