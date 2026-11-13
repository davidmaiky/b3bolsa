"use client";
import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the service worker (production only: in dev it would serve stale chunks) and offers "Instalar" when the browser allows. */
export function PwaRegister() {
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[pwa] service worker", e));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own button
      setInstall(e as InstallEvent);
    };
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!install) return null;
  return (
    <button
      className="btn-ghost text-xs !px-2 !py-1 whitespace-nowrap"
      onClick={async () => {
        await install.prompt();
        await install.userChoice.catch(() => {});
        setInstall(null);
      }}
    >
      Instalar app
    </button>
  );
}
