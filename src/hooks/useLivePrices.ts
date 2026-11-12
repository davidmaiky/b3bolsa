"use client";
import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/types";

/** Live quotes over SSE, keyed by `${TICKER}:${CLASS}`; `dir` marks the last move for a flash. */
export function useLivePrices(initial: Record<string, Quote> = {}) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>(initial);
  const [dir, setDir] = useState<Record<string, { d: "up" | "down"; n: number }>>({});
  const [connected, setConnected] = useState(false);
  const ref = useRef(quotes);
  ref.current = quotes;

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("snapshot", (e) => setQuotes((q) => ({ ...q, ...JSON.parse((e as MessageEvent).data) })));
    es.addEventListener("quote", (e) => {
      const { key, q } = JSON.parse((e as MessageEvent).data) as { key: string; q: Quote };
      const prev = ref.current[key];
      if (prev && prev.price !== q.price) {
        setDir((d) => ({ ...d, [key]: { d: q.price > prev.price ? "up" : "down", n: (d[key]?.n ?? 0) + 1 } }));
      }
      setQuotes((all) => ({ ...all, [key]: q }));
    });
    return () => es.close();
  }, []);

  return { quotes, dir, connected };
}
