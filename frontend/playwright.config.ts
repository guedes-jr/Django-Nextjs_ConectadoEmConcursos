import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0, // A failure is reported directly; fixtures may change server state.
  workers: 1,
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  reporter: [["list"], ["html", {open: "never"}]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {name: "chromium", testIgnore: "**/pwa.spec.ts", use: {...devices["Desktop Chrome"]}},
    ...(process.env.E2E_PRODUCTION ? [
      {name: "pwa-desktop", testMatch: "**/pwa.spec.ts", use: {...devices["Desktop Chrome"], serviceWorkers: "allow" as const}},
      {name: "pwa-mobile", testMatch: "**/pwa.spec.ts", use: {...devices["Pixel 7"], defaultBrowserType: "chromium" as const, serviceWorkers: "allow" as const}},
    ] : []),
  ],
  webServer: [
    {
      command: `"${process.env.E2E_PYTHON || path.resolve("../backend/.venv/bin/python")}" e2e/backend.py`,
      url: "http://127.0.0.1:8100/api/plans/",
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: {signal: "SIGTERM", timeout: 5000},
    },
    {
      command: process.env.E2E_PRODUCTION ? "npm run start -- --hostname 127.0.0.1 -p 3100" : "npm run dev:frontend -- --hostname 127.0.0.1 -p 3100 --webpack",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {E2E_RUN: "1", NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100", NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:8100"},
      gracefulShutdown: {signal: "SIGTERM", timeout: 5000},
    },
  ],
});
