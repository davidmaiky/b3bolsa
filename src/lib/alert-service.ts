import { db } from "./db";
import { priceService, quoteKey } from "./prices";
import { getFundamentals } from "./analysis";
import { describeAlert, isDynamic, isTriggered, thresholdFor } from "./alerts";
import { fmtMoney } from "./format";
import type { AssetClass, Quote } from "./types";

interface Watched {
  id: string;
  type: string;
  target: number | null;
  assetId: string;
  ticker: string;
  assetClass: AssetClass;
  currency: string;
  key: string;
  threshold?: number;
  firing?: boolean;
}

const THRESHOLD_REFRESH_MS = 6 * 3600_000;

class AlertService {
  private watched = new Map<string, Watched[]>(); // quoteKey → alerts
  private timer?: NodeJS.Timeout;
  started = false;

  start() {
    if (this.started) return;
    this.started = true;
    priceService.on("quote", (key: string, q: Quote) => void this.onQuote(key, q));
    void this.reload();
    this.timer = setInterval(() => void this.reload(), THRESHOLD_REFRESH_MS);
    this.timer.unref?.();
  }

  /** Re-reads the active alerts (call after any create/update/delete) and refreshes dynamic thresholds. */
  async reload() {
    const rows = await db.alert.findMany({ where: { active: true }, include: { asset: true } });
    const next = new Map<string, Watched[]>();
    const prev = new Map([...this.watched.values()].flat().map((w) => [w.id, w]));
    for (const a of rows) {
      const ref = { ticker: a.asset.ticker, assetClass: a.asset.assetClass as AssetClass, currency: a.asset.currency };
      const w: Watched = {
        id: a.id, type: a.type, target: a.target, assetId: a.assetId, ...ref,
        key: quoteKey(ref),
        threshold: isDynamic(a.type) ? prev.get(a.id)?.threshold : thresholdFor(a.type, a.target, null),
      };
      next.set(w.key, [...(next.get(w.key) ?? []), w]);
      priceService.track([ref]); // keep prices flowing even if nobody has the site open
    }
    this.watched = next;
    // dynamic thresholds depend on the (cached) fundamentals
    for (const w of [...next.values()].flat().filter((x) => isDynamic(x.type))) {
      try {
        const f = await getFundamentals({ id: w.assetId, ticker: w.ticker, assetClass: w.assetClass, currency: w.currency });
        w.threshold = thresholdFor(w.type, w.target, f);
      } catch (e) {
        console.warn("[alerts] fundamentals", w.ticker, (e as Error).message);
      }
    }
  }

  private async onQuote(key: string, q: Quote) {
    const list = this.watched.get(key);
    if (!list) return;
    for (const w of list) {
      if (w.firing || !isTriggered(w.type, q.price, w.threshold)) continue;
      w.firing = true;
      try {
        // active: true in the filter makes this atomic: only the first caller flips it
        const r = await db.alert.updateMany({ where: { id: w.id, active: true }, data: { active: false, triggeredAt: new Date(), triggerPrice: q.price } });
        if (r.count) await this.notify(w, q.price);
      } catch (e) {
        console.warn("[alerts] trigger failed", (e as Error).message);
      } finally {
        this.watched.set(key, (this.watched.get(key) ?? []).filter((x) => x.id !== w.id));
      }
    }
  }

  private async notify(w: Watched, price: number) {
    const text = `Alerta: ${w.ticker} chegou a ${fmtMoney(price, w.currency)} (${describeAlert(w.type, w.threshold, (n) => fmtMoney(n, w.currency))}).`;
    console.log("[alerts]", text);
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chat = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chat) return;
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) console.warn("[alerts] telegram", r.status);
    } catch (e) {
      console.warn("[alerts] telegram", (e as Error).message);
    }
  }

  /** Current threshold of an active alert (for display). */
  thresholdOf(id: string): number | undefined {
    for (const list of this.watched.values()) for (const w of list) if (w.id === id) return w.threshold;
    return undefined;
  }
}

const g = globalThis as unknown as { __alerts?: AlertService };
export const alertService = (g.__alerts ??= new AlertService());
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN?.trim() && !!process.env.TELEGRAM_CHAT_ID?.trim();
