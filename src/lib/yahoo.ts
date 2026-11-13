import YahooFinance from "yahoo-finance2";

const g = globalThis as unknown as { __yf?: InstanceType<typeof YahooFinance> };
export const yf = (g.__yf ??= new YahooFinance({ suppressNotices: ["yahooSurvey"] }));

/** Fail fast instead of hanging the page when Yahoo is slow or unreachable. */
function timeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Yahoo Finance não respondeu")), ms))]);
}

export interface YQuote {
  symbol: string;
  price: number;
  previousClose?: number;
  changePct?: number;
  name?: string;
  currency?: string;
  ts: string;
}

/** Batched quotes. Yahoo data for B3 is delayed ~15 min. */
export async function yahooQuotes(symbols: string[]): Promise<YQuote[]> {
  if (symbols.length === 0) return [];
  const res = await timeout(yf.quote(symbols, {}, { validateResult: false }));
  const list = (Array.isArray(res) ? res : [res]) as Record<string, unknown>[];
  return list
    .filter((q) => typeof q.regularMarketPrice === "number")
    .map((q) => ({
      symbol: String(q.symbol),
      price: q.regularMarketPrice as number,
      previousClose: q.regularMarketPreviousClose as number | undefined,
      changePct: q.regularMarketChangePercent as number | undefined,
      name: (q.longName ?? q.shortName) as string | undefined,
      currency: q.currency as string | undefined,
      ts: new Date((q.regularMarketTime as Date | number | undefined) ?? Date.now()).toISOString(),
    }));
}

export interface Fundamentals {
  price?: number;
  currency?: string;
  name?: string;
  sector?: string;
  eps?: number; // LPA
  bookValuePerShare?: number; // VPA
  pe?: number; // P/L
  forwardPe?: number;
  pb?: number; // P/VP
  dividendYield?: number; // fraction (0.08 = 8%)
  dividendRate?: number; // DPA (12m)
  roe?: number; // fraction
  profitMargin?: number;
  debtToEquity?: number; // %
  earningsGrowth?: number;
  revenueGrowth?: number;
  currentRatio?: number;
  pegRatio?: number;
  evToEbitda?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  beta?: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export async function yahooFundamentals(symbol: string): Promise<Fundamentals> {
  const r = (await timeout(
    yf.quoteSummary(
      symbol,
      { modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] },
      { validateResult: false },
    ),
  )) as Record<string, Record<string, unknown> | undefined>;
  const p = r.price ?? {};
  const s = r.summaryDetail ?? {};
  const k = r.defaultKeyStatistics ?? {};
  const f = r.financialData ?? {};
  const price = num(p.regularMarketPrice) ?? num(f.currentPrice);
  const eps = num(k.trailingEps);
  const bvps = num(k.bookValue);
  return {
    price,
    currency: p.currency as string | undefined,
    name: (p.longName ?? p.shortName) as string | undefined,
    sector: r.assetProfile?.sector as string | undefined,
    eps,
    bookValuePerShare: bvps,
    pe: num(s.trailingPE) ?? (price && eps && eps > 0 ? price / eps : undefined),
    forwardPe: num(s.forwardPE) ?? num(k.forwardPE),
    pb: num(k.priceToBook) ?? (price && bvps ? price / bvps : undefined),
    dividendYield: num(s.trailingAnnualDividendYield) ?? num(s.dividendYield),
    dividendRate: num(s.trailingAnnualDividendRate) ?? num(s.dividendRate),
    roe: num(f.returnOnEquity),
    profitMargin: num(f.profitMargins),
    debtToEquity: num(f.debtToEquity),
    earningsGrowth: num(f.earningsGrowth),
    revenueGrowth: num(f.revenueGrowth),
    currentRatio: num(f.currentRatio),
    pegRatio: num(k.pegRatio),
    evToEbitda: num(k.enterpriseToEbitda),
    marketCap: num(p.marketCap) ?? num(s.marketCap),
    fiftyTwoWeekHigh: num(s.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(s.fiftyTwoWeekLow),
    fiftyDayAverage: num(s.fiftyDayAverage),
    twoHundredDayAverage: num(s.twoHundredDayAverage),
    beta: num(s.beta),
  };
}

/** Daily closes for momentum/volatility (crypto, FX, and charts). */
export async function yahooHistory(symbol: string, days = 365) {
  const period1 = new Date(Date.now() - days * 86_400_000);
  const r = (await timeout(yf.chart(symbol, { period1, interval: "1d" }, { validateResult: false }))) as {
    quotes: { date: Date; close: number | null }[];
  };
  return r.quotes
    .filter((q) => typeof q.close === "number")
    .map((q) => ({ date: new Date(q.date).toISOString().slice(0, 10), close: q.close as number }));
}

export async function yahooSearch(q: string) {
  const r = (await timeout(yf.search(q, { quotesCount: 10, newsCount: 0 }, { validateResult: false }))) as {
    quotes: Record<string, unknown>[];
  };
  return r.quotes
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: String(x.symbol),
      name: String(x.longname ?? x.shortname ?? x.symbol),
      type: String(x.quoteType ?? ""),
      exchange: String(x.exchange ?? ""),
    }));
}

/** Dividend history (per share, gross, by ex-date). Covers B3 and US stocks. */
export async function yahooDividends(symbol: string, fromDate: Date): Promise<{ date: string; amount: number }[]> {
  const r = (await timeout(yf.chart(symbol, { period1: fromDate, interval: "1mo", events: "div" }, { validateResult: false }), 15000)) as {
    events?: { dividends?: { amount: number; date: Date | number }[] };
  };
  return (r.events?.dividends ?? [])
    .filter((d) => typeof d.amount === "number" && d.amount > 0)
    .map((d) => ({ date: new Date(d.date).toISOString().slice(0, 10), amount: d.amount }));
}

/** Symbols Yahoo considers similar to this one (not strictly the same sector). */
export async function yahooSimilar(symbol: string): Promise<string[]> {
  const r = (await timeout(yf.recommendationsBySymbol(symbol, {}, { validateResult: false }))) as { recommendedSymbols?: { symbol?: string }[] };
  return (r.recommendedSymbols ?? []).map((x) => String(x.symbol ?? "")).filter(Boolean);
}
