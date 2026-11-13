import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow opening the dev server from other devices on the local network
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  // keep the WebSocket client and Yahoo client as plain Node modules
  serverExternalPackages: ["ws", "yahoo-finance2"],
};

export default nextConfig;
