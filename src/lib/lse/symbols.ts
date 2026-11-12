import type { AssetRef } from "../types";

export const LSE_SOCKETS = {
  data: process.env.LSE_WS_DATA_URL || "wss://data-ws.londonstrategicedge.com", // US stocks, forex, commodities
  london: process.env.LSE_WS_LONDON_URL || "wss://london-ws.londonstrategicedge.com", // UK stocks, crypto
};
export type LseSocket = keyof typeof LSE_SOCKETS;

export interface LseMapping {
  socket: LseSocket;
  wsSymbol: string; // AAPL, BTC/USD, USD/BRL
  restMarket: string; // us_stocks, crypto, forex
  restSymbol: string; // AAPL, BTCUSDT, USD_BRL
  yahooSymbol: string; // fallback: AAPL, BTC-USD, BRL=X
}

/**
 * Maps one of our assets to LSE symbols. B3 stocks are not covered by LSE
 * (returns null); they are priced through Yahoo Finance.
 * FX tickers are the foreign currency priced in BRL ("USD" => USD/BRL).
 */
export function lseMapping(a: AssetRef): LseMapping | null {
  const t = a.ticker.toUpperCase();
  switch (a.assetClass) {
    case "US":
      return {
        socket: "data",
        wsSymbol: t,
        restMarket: "us_stocks",
        restSymbol: t,
        yahooSymbol: t,
      };
    case "CRYPTO":
      return {
        socket: "london",
        wsSymbol: `${t}/USD`,
        restMarket: "crypto",
        restSymbol: `${t}USDT`,
        yahooSymbol: `${t}-USD`,
      };
    case "FX":
      return {
        socket: "data",
        wsSymbol: `${t}/BRL`,
        restMarket: "forex",
        restSymbol: `${t}_BRL`,
        yahooSymbol: t === "USD" ? "BRL=X" : `${t}BRL=X`,
      };
    default:
      return null;
  }
}

export function yahooSymbol(a: AssetRef): string {
  if (a.assetClass === "B3") return `${a.ticker.toUpperCase()}.SA`;
  return lseMapping(a)!.yahooSymbol;
}

/** The USD→BRL rate used to convert USD positions. */
export const USDBRL: AssetRef = { ticker: "USD", assetClass: "FX", currency: "BRL" };
