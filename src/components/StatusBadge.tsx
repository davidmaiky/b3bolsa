"use client";
import { useEffect, useState } from "react";

interface Status {
  lseConfigured: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
  sockets: { socket: string; state: string; subscribed: string[]; overflow: string[]; maxSubscriptions: number; lastError?: string }[];
  yahooError: string | null;
  authEnabled?: boolean;
}

export function StatusBadge() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/status").then((r) => (r.ok ? r.json() : Promise.reject())).then(setS).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  const live = s.sockets.some((x) => x.state === "authenticated");
  const dot = (ok: boolean) => <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-up" : "bg-down"}`} />;
  const title = [
    ...s.sockets.map((x) => `${x.socket}-ws: ${x.state} (${x.subscribed.length}/${x.maxSubscriptions})${x.overflow.length ? ` excedentes via polling: ${x.overflow.join(", ")}` : ""}${x.lastError ? ` — ${x.lastError}` : ""}`),
    s.yahooError ? `Yahoo: ${s.yahooError}` : "Yahoo: ok",
  ].join("\n");
  return (
    <div className="flex items-center gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-muted" title={title}>
      <span className="flex items-center gap-1.5">{dot(s.lseConfigured && live)} LSE {s.lseConfigured ? (live ? "ao vivo" : "conectando") : "sem chave"}</span>
      <span className="flex items-center gap-1.5">{dot(!s.yahooError)} Yahoo</span>
      <span className="flex items-center gap-1.5">{dot(s.geminiConfigured)} Gemini</span>
      {s.authEnabled && (
        <button className="hover:text-fg underline-offset-2 hover:underline" onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => (window.location.href = "/login"))}>Sair</button>
      )}
    </div>
  );
}
