import { test, expect, Page } from "@playwright/test";

async function login(page: Page, user: string) {
  await page.goto("/login?next=%2Fadmin%2Fconfiguracoes%2Fpagamentos");
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(url => url.pathname === "/admin/configuracoes/pagamentos");
}

test("superadmin saves Efí credentials without exposing them on reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, "admin");
  await page.getByLabel("Provedor para novas compras").selectOption("efi");
  await page.getByLabel("Ambiente", { exact: true }).selectOption("sandbox");
  await page.getByLabel("Client ID", { exact: true }).fill("synthetic-client");
  await page.getByLabel("Client Secret", { exact: true }).fill("synthetic-secret");
  await page.getByLabel("URL pública de notificação").fill("https://example.test/api/billing/efi/notifications/");
  await page.getByRole("button", { name: "Salvar configuração", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Configuração salva");
  await expect(page.getByLabel("Client Secret", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Provedor para novas compras")).toHaveValue("efi");
  await expect(page.getByLabel("Client ID", { exact: true })).toHaveAttribute("placeholder", /Salvo/);
  await expect(page.getByLabel("Client Secret", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Testar conexão Efí salva" })).toBeEnabled();
  await page.goto("/platafom/pagamentos");
  await expect(page).toHaveURL(url => url.pathname === "/admin/configuracoes/pagamentos");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator("aside").boundingBox())?.x).toBeLessThanOrEqual(-255);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  for (const control of await page.locator("form input, form select, form fieldset").all()) {
    const box = await control.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBeTruthy();
  }
  await page.screenshot({ path: "/tmp/payment-settings-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("ordinary staff cannot view or change payment credentials", async ({ page }) => {
  await login(page, "limited");
  await expect(page.getByRole("alert").filter({ hasText: /permissão/ })).toBeVisible();
  await expect(page.getByLabel("Client Secret", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar configuração", exact: true })).toHaveCount(0);
});
