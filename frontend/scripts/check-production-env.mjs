// Read exactly the production env files used by Next; never print their contents.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

for (const name of ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_BACKEND_URL", ...(process.env.APP_PUBLIC_URL ? ["APP_PUBLIC_URL"] : [])]) {
  let url;
  try { url = new URL(process.env[name]); }
  catch { throw new Error(`${name} precisa ser uma origem HTTPS de produção.`); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host.startsWith("127.") || host === "0.0.0.0") {
    throw new Error(`${name} precisa ser uma origem HTTPS pública, sem credenciais, caminho ou parâmetros.`);
  }
}
console.log("Configuração pública de produção validada.");
