export interface Tx {
  type: "BUY" | "SELL" | string;
  quantity: number;
  price: number;
  fees?: number;
  date: Date | string;
}

export interface Position {
  quantity: number;
  avgPrice: number; // includes buy fees
  cost: number; // quantity * avgPrice
  realizedPnl: number; // in asset currency
  invested: number; // total ever bought (gross)
}

/** Weighted average price method (padrão da Receita Federal para ações). */
export function computePosition(txs: Tx[]): Position {
  const sorted = [...txs].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let qty = 0;
  let avg = 0;
  let realized = 0;
  let invested = 0;
  for (const t of sorted) {
    const fees = t.fees ?? 0;
    if (t.type === "BUY") {
      const total = qty * avg + t.quantity * t.price + fees;
      qty += t.quantity;
      avg = qty > 0 ? total / qty : 0;
      invested += t.quantity * t.price + fees;
    } else if (t.type === "SELL") {
      const q = Math.min(t.quantity, qty);
      realized += q * (t.price - avg) - fees;
      qty -= q;
      if (qty <= 1e-12) {
        qty = 0;
        avg = 0;
      }
    }
  }
  return { quantity: qty, avgPrice: avg, cost: qty * avg, realizedPnl: realized, invested };
}

export interface Valued extends Position {
  price?: number;
  marketValue?: number; // asset currency
  unrealizedPnl?: number;
  unrealizedPct?: number;
  dayChangePct?: number;
  fxToBrl: number;
  marketValueBrl?: number;
  costBrl: number;
}

export function valuePosition(
  p: Position,
  price: number | undefined,
  fxToBrl: number,
  dayChangePct?: number,
): Valued {
  const mv = price !== undefined ? p.quantity * price : undefined;
  const upnl = mv !== undefined ? mv - p.cost : undefined;
  return {
    ...p,
    price,
    marketValue: mv,
    unrealizedPnl: upnl,
    unrealizedPct: upnl !== undefined && p.cost > 0 ? (upnl / p.cost) * 100 : undefined,
    dayChangePct,
    fxToBrl,
    marketValueBrl: mv !== undefined ? mv * fxToBrl : undefined,
    costBrl: p.cost * fxToBrl,
  };
}
