import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carteira Global",
    short_name: "Carteira",
    description: "Portfólio de ações B3, EUA, FIIs, cripto, moedas e renda fixa, com cotações em tempo real",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Transações", url: "/transacoes", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Alertas", url: "/alertas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Renda fixa", url: "/renda-fixa", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
