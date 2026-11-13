"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import { AlertToaster } from "./AlertToaster";
import { PwaRegister } from "./PwaRegister";

const NAV = [
  { href: "/", label: "Carteira" },
  { href: "/renda-fixa", label: "Renda fixa" },
  { href: "/transacoes", label: "Transações" },
  { href: "/evolucao", label: "Evolução" },
  { href: "/proventos", label: "Proventos" },
  { href: "/alertas", label: "Alertas" },
  { href: "/rebalanceamento", label: "Rebalancear" },
  { href: "/imposto", label: "IR" },
  { href: "/sugestoes", label: "Sugestões IA" },
];

export function Header() {
  const path = usePathname();
  const login = path === "/login";
  return (
    <>
    <header className="border-b border-line bg-panel">
      <div className="mx-auto max-w-7xl px-4 py-2 sm:py-0 sm:h-14 flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link href="/" className="font-semibold tracking-tight">Carteira Global</Link>
        <div className="ml-auto sm:order-last flex items-center gap-3"><PwaRegister />{!login && <StatusBadge />}</div>
        {!login && (
          <nav className="order-last sm:order-none w-full sm:w-auto flex gap-1 sm:gap-4 text-sm text-muted -mx-2 sm:mx-0 overflow-x-auto">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`px-2 py-2 sm:px-0 sm:py-0 whitespace-nowrap hover:text-fg ${path === n.href ? "text-fg" : ""}`}>{n.label}</Link>
            ))}
          </nav>
        )}
      </div>
    </header>
    {!login && <AlertToaster />}
    </>
  );
}
