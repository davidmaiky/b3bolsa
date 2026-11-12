import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep the WebSocket client and Yahoo client as plain Node modules
  serverExternalPackages: ["ws", "yahoo-finance2"],
};

export default nextConfig;
