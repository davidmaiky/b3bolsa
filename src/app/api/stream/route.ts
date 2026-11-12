import { loadPositions } from "@/lib/server-portfolio";
import { priceService } from "@/lib/prices";
import type { Quote } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-Sent Events: every quote update of the tracked assets. */
export async function GET(req: Request) {
  await loadPositions(); // makes sure every asset is tracked
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("snapshot", priceService.snapshot());
      const onQuote = (key: string, q: Quote) => send("quote", { key, q });
      priceService.on("quote", onQuote);
      const hb = setInterval(() => send("ping", Date.now()), 20_000);
      cleanup = () => {
        priceService.off("quote", onQuote);
        clearInterval(hb);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
