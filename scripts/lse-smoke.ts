/** Checks the LSE key: REST /v3/usage, then 10 s of live ticks for AAPL, EUR/USD and BTC/USD. */
import WebSocket from "ws";

const key = process.env.LSE_API_KEY;
if (!key) throw new Error("Defina LSE_API_KEY (ex.: LSE_API_KEY=... npm run lse:smoke)");

(async () => {
  const r = await fetch("https://download.londonstrategicedge.com/v3/usage", { headers: { "X-API-Key": key } });
  console.log("usage", r.status, await r.json());

  for (const [url, symbols] of [
    ["wss://data-ws.londonstrategicedge.com", ["AAPL", "EUR/USD", "USD/BRL"]],
    ["wss://london-ws.londonstrategicedge.com", ["BTC/USD"]],
  ] as const) {
    const ws = new WebSocket(url);
    ws.on("open", () => ws.send(JSON.stringify({ action: "auth", api_key: key })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "authenticated") symbols.forEach((s) => ws.send(JSON.stringify({ action: "subscribe", symbol: s })));
      else if (m.type === "tick") console.log(url.split("//")[1].split(".")[0], m.ts, m.symbol, m.price);
      else if (m.type !== "welcome") console.log(m.type, m.symbol ?? "", m.code ?? "", m.message ?? "");
    });
    setTimeout(() => ws.close(), 10_000);
  }
})();
