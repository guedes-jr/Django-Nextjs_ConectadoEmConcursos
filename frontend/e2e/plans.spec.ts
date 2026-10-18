import { test, expect, Page } from "@playwright/test";

async function login(page: Page, user: string) {
  await page.goto("/login?next=%2Fadmin%2Fplanos");
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page).toHaveURL(/\/admin\/planos$/);
}

test("plans standard preserves benefit filters and distinguishes empty results", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, "admin");
  await expect(page.getByRole("region", {name: "Resumo geral dos planos"})).toBeVisible();
  await page.getByRole("button", {name: "Novo plano", exact: true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome comercial").fill("Plano de revisão E2E");
  await dialog.getByLabel("Slug", {exact: true}).fill("revisao-e2e");
  await dialog.getByLabel("Benefícios").fill("Mentoria exclusiva E2E");
  await dialog.getByRole("button", {name: "Salvar plano"}).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Buscar planos", {exact: true}).fill("Mentoria exclusiva E2E");
  await expect(page.getByRole("status").filter({hasText: "1 registro encontrado"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Plano de revisão E2E", exact: true})).toBeVisible();
  await expect(page).toHaveURL(/q=Mentoria/);
  await page.reload();
  await expect(page.getByLabel("Buscar planos", {exact: true})).toHaveValue("Mentoria exclusiva E2E");
  await expect(page.getByRole("heading", {name: "Plano de revisão E2E", exact: true})).toBeVisible();
  await page.getByLabel("Buscar planos", {exact: true}).fill("inexistente-e2e");
  await expect(page.getByText("Nenhum plano corresponde aos filtros")).toBeVisible();
  await page.getByRole("button", {name: "Limpar filtros", exact: true}).first().click();
  await expect(page.getByRole("heading", {name: "Plano de revisão E2E", exact: true})).toBeVisible();
  await page.screenshot({path: "/tmp/admin-planos-desktop.png", fullPage: true});
  expect(errors).toEqual([]);
});

test("plans standard hides restricted metrics and fits mobile", async ({page}) => {
  await login(page, "limited");
  await expect(page.getByText("Assinaturas vigentes", {exact: true})).toBeVisible();
  await expect(page.getByText("MRR estimado", {exact: true})).toHaveCount(0);
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.getByRole("button", {name: "Novo plano", exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: /^Visualizar /}).first()).toBeVisible();
  await page.screenshot({path: "/tmp/admin-planos-mobile.png", fullPage: true});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
