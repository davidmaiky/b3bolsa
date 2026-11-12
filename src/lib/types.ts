export type AssetClass = "B3" | "US" | "CRYPTO" | "FX";

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  B3: "Ações B3",
  US: "Ações EUA",
  CRYPTO: "Criptomoedas",
  FX: "Moedas",
};

export interface Quote {
  ticker: string; // our ticker (PETR4, AAPL, BTC, USD)
  price: number;
  bid?: number;
  ask?: number;
  previousClose?: number;
  changePct?: number;
  ts: string; // ISO
  source: "lse-ws" | "lse-rest" | "yahoo";
  delayed?: boolean;
}

export interface AssetRef {
  ticker: string;
  assetClass: AssetClass;
  currency: string;
}
