import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carteira Global",
  description: "Portfólio de ações B3, EUA, cripto e moedas com cotações em tempo real e sugestões por IA",
};

const NAV = [
  { href: "/", label: "Carteira" },
  { href: "/transacoes", label: "Transações" },
  { href: "/sugestoes", label: "Sugestões IA" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased min-h-screen">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">Carteira Global</Link>
            <nav className="flex gap-4 text-sm text-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-fg">{n.label}</Link>
              ))}
            </nav>
            <div className="ml-auto"><StatusBadge /></div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
