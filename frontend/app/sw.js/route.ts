import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  const template = readFileSync(path.join(process.cwd(), "lib/pwa/service-worker.js"), "utf8");
  const source = template.replace("__PWA_BUILD_ID__", process.env.PWA_BUILD_ID!);
  return new Response(source, {headers: {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Service-Worker-Allowed": "/",
  }});
}
