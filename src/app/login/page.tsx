"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/auth";

function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) return void (window.location.href = next);
    setBusy(false);
    setErr((await r.json().catch(() => ({}))).error ?? "Erro ao entrar");
  };

  return (
    <form onSubmit={submit} className="card p-5 space-y-4 w-full max-w-sm mx-auto mt-10">
      <h1 className="font-semibold text-lg">Entrar</h1>
      <label className="block">
        <span className="text-xs text-muted block mb-1">Senha</span>
        <input className="input w-full" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {err && <p className="text-down text-sm">{err}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
