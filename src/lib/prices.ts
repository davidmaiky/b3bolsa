import { EventEmitter } from "node:events";
import { lseHub, type LseTick } from "./lse/stream";
import { lseKey, lsePreview } from "./lse/rest";
import { lseMapping, yahooSymbol, USDBRL } from "./lse/symbols";
import { yahooQuotes } from "./yahoo";
import type { AssetRef, Quote } from "./types";

const POLL_MS = 30_000;
const LSE_GRACE_MS = 15_000; // no LSE tick after this → Yahoo serves the price

/**
 * Unified prices. LSE WebSocket for US stocks, crypto and FX (real time);
 * Yahoo Finance polling for B3 (delayed) and as a fallback for any symbol the
 * LSE stream does not answer (e.g. a pair outside its 60 forex pairs, or a
 * symbol past the free plan's 16 slots).
 */
class PriceService extends EventEmitter {
  private tracked = new Map<string, { asset: AssetRef; since: number }>();
  readonly quotes = new Map<string, Quote>();
  private wsIndex = new Map<string, string>(); // `${socket}:${wsSymbol}` → ticker
  private timer?: NodeJS.Timeout;
  lastPollError?: string;

  constructor() {
    super();
    this.setMaxListeners(100);
    lseHub.on("tick", (t: LseTick) => this.onTick(t));
  }

  track(assets: AssetRef[]) {
    for (const a of [USDBRL, ...assets]) { // USD/BRL first: it converts every USD position
      const key = a.ticker.toUpperCase() + ":" + a.assetClass;
      if (this.tracked.has(key)) continue;
      this.tracked.set(key, { asset: a, since: Date.now() });
      const m = lseMapping(a);
      if (m && lseKey()) {
        this.wsIndex.set(`${m.socket}:${m.wsSymbol.toUpperCase()}`, key);
        lseHub.subscribe(m.socket, m.wsSymbol);
      }
    }
    if (!this.timer) {
      this.poll();
      this.timer = setInterval(() => this.poll(), POLL_MS);
    }
  }

  untrack(a: AssetRef) {
    const key = a.ticker.toUpperCase() + ":" + a.assetClass;
    if (a.ticker === "USD" && a.assetClass === "FX") return; // always needed for conversion
    this.tracked.delete(key);
    this.quotes.delete(key);
    const m = lseMapping(a);
    if (m) {
      this.wsIndex.delete(`${m.socket}:${m.wsSymbol.toUpperCase()}`);
      lseHub.unsubscribe(m.socket, m.wsSymbol);
    }
  }

  /** Resolves with the quote as soon as it exists (or undefined after `ms`). */
  waitFor(key: string, ms = 10_000): Promise<Quote | undefined> {
    const have = this.quotes.get(key);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      const done = (q?: Quote) => { clearTimeout(t); this.off("quote", on); resolve(q); };
      const on = (k: string, q: Quote) => { if (k === key) done(q); };
      const t = setTimeout(() => done(undefined), ms);
      this.on("quote", on);
    });
  }

  get(a: AssetRef): Quote | undefined {
    return this.quotes.get(a.ticker.toUpperCase() + ":" + a.assetClass);
  }

  snapshot(): Record<string, Quote> {
    return Object.fromEntries(this.quotes);
  }

  private set(key: string, q: Quote) {
    this.quotes.set(key, q);
    this.emit("quote", key, q);
  }

  private onTick(t: LseTick) {
    const key = this.wsIndex.get(`${t.socket}:${t.symbol}`);
    if (!key) return;
    const prev = this.quotes.get(key);
    const previousClose = prev?.previousClose;
    this.set(key, {
      ticker: this.tracked.get(key)!.asset.ticker,
      price: t.price,
      bid: t.bid,
      ask: t.ask,
      previousClose,
      changePct: previousClose ? ((t.price - previousClose) / previousClose) * 100 : prev?.changePct,
      ts: t.ts,
      source: "lse-ws",
    });
  }

  /** Yahoo for B3 + previous close of everything + fallback for silent LSE symbols. */
  private async poll() {
    const entries = [...this.tracked.entries()];
    if (!entries.length) return;
    const bySymbol = new Map(entries.map(([key, v]) => [yahooSymbol(v.asset), key]));
    try {
      const qs = await yahooQuotes([...bySymbol.keys()]);
      this.lastPollError = undefined;
      for (const yq of qs) {
        const key = bySymbol.get(yq.symbol);
        if (!key) continue;
        const { asset, since } = this.tracked.get(key)!;
        const cur = this.quotes.get(key);
        const lseLive = cur?.source === "lse-ws";
        const lseExpected = !!lseMapping(asset) && !!lseKey() && Date.now() - since < LSE_GRACE_MS;
        if (lseLive) {
          // keep LSE price; only enrich with the previous close for the daily change
          cur.previousClose = yq.previousClose;
          if (yq.previousClose) cur.changePct = ((cur.price - yq.previousClose) / yq.previousClose) * 100;
          continue;
        }
        if (lseExpected) continue;
        this.set(key, {
          ticker: asset.ticker,
          price: yq.price,
          previousClose: yq.previousClose,
          changePct: yq.changePct,
          ts: yq.ts,
          source: "yahoo",
          delayed: asset.assetClass === "B3" || asset.assetClass === "FII" || asset.assetClass === "ETF",
        });
      }
    } catch (e) {
      this.lastPollError = (e as Error).message;
      console.warn("[prices] yahoo poll failed:", this.lastPollError);
      await this.lseRestFallback(entries.map(([k, v]) => [k, v.asset] as const));
    }
  }

  /** If Yahoo is down, use LSE REST candles for assets without a live tick. */
  private async lseRestFallback(entries: (readonly [string, AssetRef])[]) {
    if (!lseKey()) return;
    for (const [key, asset] of entries) {
      if (this.quotes.get(key)?.source === "lse-ws") continue;
      const m = lseMapping(asset);
      if (!m) continue;
      try {
        const rows = await lsePreview(m.restMarket, m.restSymbol, "1m");
        const last = rows.at(-1);
        if (last) this.set(key, { ticker: asset.ticker, price: last.close, ts: new Date(last.time + "Z").toISOString(), source: "lse-rest" });
      } catch {
        /* ignore — shown as missing price */
      }
    }
  }
}

const g = globalThis as unknown as { __prices?: PriceService };
export const priceService = (g.__prices ??= new PriceService());
export const quoteKey = (a: AssetRef) => a.ticker.toUpperCase() + ":" + a.assetClass;
