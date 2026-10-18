import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function ready(page: Page) {
  await page.goto("/login");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function cacheUrls(page: Page) {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith("cq-"));
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
  });
}

async function syntheticPrompt(page: Page, fail = false) {
  await page.evaluate(fail => {
    const event = new Event("beforeinstallprompt", {cancelable: true});
    Object.assign(event, {
      prompt: () => fail ? Promise.reject(new Error("synthetic failure")) : Promise.resolve(),
      userChoice: Promise.resolve({outcome: "dismissed"}),
    });
    window.dispatchEvent(event);
  }, fail);
}

test("manifest, icons and service worker headers identify an installable release", async ({page}) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.id).toBe("/login");
  expect(manifest.start_url).toBe("/login?source=pwa");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
  const source = await worker.text();
  expect(source).not.toContain("__PWA_BUILD_ID__");
  expect(source.match(/const VERSION = "([^"]+)";/)?.[1]).toBe(readFileSync(".next-e2e/BUILD_ID", "utf8").trim());
  await ready(page);
});

test("offline navigation uses the public fallback and recovers when online", async ({page, context}) => {
  await ready(page);
  await context.setOffline(true);
  await page.goto("/questions");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(page.getByRole("heading", {name: "Você está sem conexão"})).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", {name: "Tentar novamente"}).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("cache contains no API, auth HTML, media or private navigation", async ({page}) => {
  await ready(page);
  await page.goto("/login?next=/plans");
  await page.locator('input[autocomplete="email"]').first().fill("student@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page).toHaveURL(/\/plans$/);
  await page.evaluate(async () => {
    await fetch("/api/pwa-probe?private=1");
    await fetch("http://127.0.0.1:8100/api/plans/");
    await fetch("/media/private-avatar.png");
  });
  const urls = await cacheUrls(page);
  expect(urls.some(url => new URL(url).pathname === "/offline")).toBe(true);
  for (const url of urls) {
    const path = new URL(url).pathname;
    expect(path.startsWith("/_next/static/") || path.startsWith("/icons/") || ["/offline", "/favicon.ico", "/icon.png", "/apple-icon.png", "/manifest.webmanifest", "/logos/logo.png"].includes(path), path).toBe(true);
    expect(url).not.toContain(":8100");
    expect(url).not.toContain("private");
  }
});

test("first activation preserves a form and installation dismissal is remembered", async ({page}) => {
  await page.goto("/login");
  const input = page.locator('input[autocomplete="email"]').first();
  await input.fill("pending-form@example.test");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect(input).toHaveValue("pending-form@example.test");
  await syntheticPrompt(page);
  await expect(page.getByRole("button", {name: "Instalar", exact: true})).toBeVisible();
  await page.getByRole("button", {name: "Agora não", exact: true}).click();
  await page.reload();
  await syntheticPrompt(page);
  await expect(page.getByRole("button", {name: "Instalar", exact: true})).toHaveCount(0);
  await page.goto("/");
  await syntheticPrompt(page);
  await expect(page.getByText("Instalar o Conectado em Concursos", {exact: true})).toHaveCount(0);
});

test("installation failure has a usable fallback without an unhandled rejection", async ({page}) => {
  await ready(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await syntheticPrompt(page, true);
  await page.getByRole("button", {name: "Instalar", exact: true}).click();
  await expect(page.getByText("Não foi possível iniciar a instalação. Use o menu do navegador para instalar o app.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("new worker waits for consent then activates and removes old caches", async ({page}) => {
  await ready(page);
  const controller = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);
  await page.evaluate(async () => {
    await caches.open("cq-precache-legacy-test");
    // Changing the script URL forces a genuine native install lifecycle while
    // serving the same compiled release; no production endpoint is modified.
    await navigator.serviceWorker.register("/sw.js?update=pwa-test", {scope: "/", updateViaCache: "none"});
  });
  await expect(page.getByText("Nova versão disponível", {exact: true})).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(controller);
  expect(await page.evaluate(() => caches.keys())).toContain("cq-precache-legacy-test");
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.getByRole("button", {name: "Atualizar", exact: true}).click(),
  ]);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain("update=pwa-test");
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain("cq-precache-legacy-test");
});

test("chat and whiteboard fit a narrow viewport and reduced keyboard height", async ({page}, testInfo) => {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto("/login?next=/chatIA");
  await page.locator('input[autocomplete="email"]').first().fill("student@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  const composer = page.getByPlaceholder("Digite sua mensagem", {exact: true});
  await expect(composer).toBeVisible();
  await expect(page.getByRole("button", {name: /Alternar tema/})).toHaveCount(0);
  await page.getByRole("button", {name: "Abrir opções da conta", exact: true}).click();
  await expect(page.getByRole("button", {name: /Alternar tema/})).toBeVisible();
  await page.getByRole("button", {name: "Abrir opções da conta", exact: true}).click();
  await page.setViewportSize({width: 390, height: 420});
  await composer.fill("Mensagem ainda não enviada");
  await composer.scrollIntoViewIfNeeded();
  const box = await composer.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(420);
  await page.getByRole("button", {name: "Enviar", exact: true}).click({trial: true});
  if (testInfo.project.name === "pwa-mobile") await page.screenshot({path: testInfo.outputPath("chat-keyboard-viewport.png")});
  await page.goto("/lousa");
  await expect(page.getByPlaceholder("Título", {exact: true})).toBeVisible();
  await expect(page.locator(".excalidraw").first()).toBeVisible();
  await expect(page.getByRole("button", {name: /Alternar tema/})).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Voltar ao topo"})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (testInfo.project.name === "pwa-mobile") await page.screenshot({path: testInfo.outputPath("whiteboard-narrow.png")});
});


test("manual iOS instructions and installed-mode suppression use feature detection", async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"});
    Object.defineProperty(navigator, "standalone", {get: () => localStorage.getItem("test-standalone") === "1"});
  });
  await page.goto("/login");
  await expect(page.getByText("Adicionar à Tela de Início", {exact: true})).toBeVisible();
  await page.evaluate(() => localStorage.setItem("test-standalone", "1"));
  await page.reload();
  await expect(page.getByText("Instalar o Conectado em Concursos", {exact: true})).toHaveCount(0);
});
