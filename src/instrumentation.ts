/** Runs once when the Node server starts: keeps price alerts armed even with no browser open. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { alertService } = await import("./lib/alert-service");
    alertService.start();
  }
}
