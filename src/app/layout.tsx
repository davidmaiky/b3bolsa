import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carteira Global",
  description: "Portfólio de ações B3, EUA, cripto e moedas com cotações em tempo real e sugestões por IA",
  applicationName: "Carteira Global",
  appleWebApp: { capable: true, title: "Carteira", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#0b0f14", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased min-h-screen">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
