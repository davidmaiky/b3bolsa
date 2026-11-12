import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { LSE_SOCKETS, type LseSocket } from "./symbols";
import { lseKey } from "./rest";

export interface LseTick {
  socket: LseSocket;
  symbol: string; // as the socket spells it (upper-cased)
  price: number;
  bid?: number;
  ask?: number;
  volume?: number;
  ts: string;
}

export type HubStatus = {
  socket: LseSocket;
  state: "idle" | "connecting" | "open" | "authenticated" | "closed" | "error";
  subscribed: string[];
  overflow: string[]; // symbols refused (slot limit) — served by polling instead
  maxSubscriptions: number;
  lastError?: string;
};

const PING_MS = 25_000;

/**
 * One connection per LSE socket (the free plan allows exactly one), shared by
 * every browser tab through the server. Reconnects with exponential backoff and
 * re-subscribes everything it held.
 */
class SocketConn {
  ws: WebSocket | null = null;
  state: HubStatus["state"] = "idle";
  wanted = new Set<string>(); // symbols we want
  acked = new Set<string>(); // symbols the socket confirmed
  pending = new Set<string>(); // subscribe sent, not yet confirmed
  overflow = new Set<string>();
  maxSubscriptions = 16;
  lastError?: string;
  private ping?: NodeJS.Timeout;
  private retry = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private name: LseSocket,
    private emit: (t: LseTick) => void,
  ) {}

  want(symbol: string) {
    symbol = symbol.toUpperCase();
    if (this.wanted.has(symbol)) return;
    this.wanted.add(symbol);
    if (this.state === "authenticated") this.sendSubscribe(symbol);
    else this.connect();
  }

  unwant(symbol: string) {
    symbol = symbol.toUpperCase();
    this.wanted.delete(symbol);
    this.overflow.delete(symbol);
    this.pending.delete(symbol);
    if (this.acked.delete(symbol)) this.send({ action: "unsubscribe", symbol });
    // a freed slot may let an overflowed symbol in
    for (const s of this.overflow) {
      this.overflow.delete(s);
      this.sendSubscribe(s);
      break;
    }
  }

  private sendSubscribe(symbol: string) {
    if (this.acked.has(symbol) || this.pending.has(symbol)) return;
    if (this.acked.size + this.pending.size >= this.maxSubscriptions) {
      this.overflow.add(symbol);
      return;
    }
    this.pending.add(symbol);
    this.send({ action: "subscribe", symbol });
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  connect() {
    if (this.ws || !lseKey()) {
      if (!lseKey()) {
        this.state = "error";
        this.lastError = "LSE_API_KEY não configurada";
      }
      return;
    }
    this.state = "connecting";
    const ws = new WebSocket(LSE_SOCKETS[this.name], { maxPayload: 32 * 1024 * 1024 });
    this.ws = ws;

    ws.on("open", () => {
      this.state = "open";
      this.send({ action: "auth", api_key: lseKey() });
    });

    ws.on("message", (raw) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (m.type) {
        case "authenticated":
          this.state = "authenticated";
          this.retry = 0;
          this.lastError = undefined;
          if (typeof m.max_subscriptions === "number") this.maxSubscriptions = m.max_subscriptions;
          this.acked.clear();
          this.pending.clear();
          this.overflow.clear();
          for (const s of this.wanted) this.sendSubscribe(s);
          clearInterval(this.ping);
          this.ping = setInterval(() => this.send({ action: "ping" }), PING_MS);
          break;
        case "subscribed": {
          const sym = String(m.symbol).toUpperCase();
          this.pending.delete(sym);
          this.acked.add(sym);
          break;
        }
        case "unsubscribed":
          this.acked.delete(String(m.symbol).toUpperCase());
          break;
        case "tick":
          if (typeof m.price === "number") {
            this.emit({
              socket: this.name,
              symbol: String(m.symbol).toUpperCase(),
              price: m.price,
              bid: m.bid as number | undefined,
              ask: m.ask as number | undefined,
              volume: m.volume as number | undefined,
              ts: new Date(String(m.ts)).toISOString(),
            });
          }
          break;
        case "error": {
          const code = String(m.code);
          this.lastError = `${code}: ${m.message ?? ""}`;
          if (code === "LIMIT_REACHED") {
            // the refusal names no symbol: every unconfirmed request goes to polling
            for (const s of this.pending) this.overflow.add(s);
            this.pending.clear();
          }
          if (code === "INVALID_KEY" || code === "TOO_MANY_CONNECTIONS") this.state = "error";
          console.warn(`[lse:${this.name}]`, this.lastError);
          break;
        }
      }
    });

    ws.on("error", (err) => {
      this.lastError = err.message;
    });

    ws.on("close", () => {
      clearInterval(this.ping);
      this.ws = null;
      this.acked.clear();
      this.pending.clear();
      if (this.state !== "error") this.state = "closed";
      if (this.wanted.size === 0) return;
      const delay = Math.min(60_000, 1000 * 2 ** this.retry++);
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  status(): HubStatus {
    return {
      socket: this.name,
      state: this.state,
      subscribed: [...this.acked],
      overflow: [...this.overflow],
      maxSubscriptions: this.maxSubscriptions,
      lastError: this.lastError,
    };
  }
}

export class LseStreamHub extends EventEmitter {
  private conns: Record<LseSocket, SocketConn>;
  readonly last = new Map<string, LseTick>(); // key `${socket}:${symbol}`

  constructor() {
    super();
    this.setMaxListeners(100);
    const emit = (t: LseTick) => {
      this.last.set(`${t.socket}:${t.symbol}`, t);
      this.emit("tick", t);
    };
    this.conns = { data: new SocketConn("data", emit), london: new SocketConn("london", emit) };
  }

  subscribe(socket: LseSocket, symbol: string) {
    this.conns[socket].want(symbol);
  }
  unsubscribe(socket: LseSocket, symbol: string) {
    this.conns[socket].unwant(symbol);
  }
  lastTick(socket: LseSocket, symbol: string) {
    return this.last.get(`${socket}:${symbol.toUpperCase()}`);
  }
  status(): HubStatus[] {
    return Object.values(this.conns).map((c) => c.status());
  }
}

const g = globalThis as unknown as { __lseHub?: LseStreamHub };
export const lseHub = (g.__lseHub ??= new LseStreamHub());
