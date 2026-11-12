import { afterAll, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

// A mock LSE socket speaking the documented protocol (welcome → auth → subscribe → tick),
// with a 2-symbol slot limit to exercise the overflow path.
const PORT = 18765;
const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws) => {
  let n = 0;
  ws.send(JSON.stringify({ type: "welcome", message: "hi" }));
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.action === "auth") ws.send(JSON.stringify({ type: "authenticated", max_subscriptions: 2 }));
    if (m.action === "subscribe") {
      if (++n > 2) return ws.send(JSON.stringify({ type: "error", code: "LIMIT_REACHED", message: "Max 2" }));
      ws.send(JSON.stringify({ type: "subscribed", symbol: m.symbol, count: n, max: 2 }));
      ws.send(JSON.stringify({ type: "tick", symbol: m.symbol, price: 100 + n, bid: 99, ask: 101, ts: "2026-11-12T20:00:00+00:00" }));
    }
  });
});
afterAll(() => wss.close());

describe("LSE stream → price service", () => {
  it("authenticates, subscribes, maps ticks to our tickers and respects the slot limit", async () => {
    process.env.LSE_API_KEY = "test";
    process.env.LSE_WS_DATA_URL = `ws://localhost:${PORT}`;
    process.env.LSE_WS_LONDON_URL = `ws://localhost:${PORT}`;
    const { priceService } = await import("../prices");
    const { lseHub } = await import("../lse/stream");

    priceService.track([
      { ticker: "AAPL", assetClass: "US", currency: "USD" },
      { ticker: "MSFT", assetClass: "US", currency: "USD" },
      { ticker: "BTC", assetClass: "CRYPTO", currency: "USD" },
    ]);
    await new Promise((r) => setTimeout(r, 800));

    // USD/BRL is always tracked (first), so with 2 slots on data-ws one US stock overflows
    const data = lseHub.status().find((s) => s.socket === "data")!;
    expect(data.state).toBe("authenticated");
    expect(data.subscribed.length).toBe(2);
    expect(data.overflow.length).toBe(1);

    const btc = priceService.quotes.get("BTC:CRYPTO");
    expect(btc?.source).toBe("lse-ws");
    expect(btc?.price).toBe(101);
    expect(priceService.quotes.get("USD:FX")?.source).toBe("lse-ws");
  });
});
