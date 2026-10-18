import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const releaseId = process.env.CONECTADO_BUILD_ID || randomUUID();
// Next loads this config in several build workers; share one release identity.
process.env.CONECTADO_BUILD_ID = releaseId;

const nextConfig: NextConfig = {
  generateBuildId: async () => releaseId,
  env: { PWA_BUILD_ID: releaseId },
  distDir: process.env.E2E_RUN === "1" ? ".next-e2e" : ".next",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
