import { test, expect, Page } from "@playwright/test";

async function login(page: Page, user = "admin") {
  await page.goto("/login?next=%2Fadmin%2Fassinaturas");
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page).toHaveURL(/\/admin\/assinaturas$/);
}

test("subscriptions standard filters, restores URL, edits and fits mobile", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === "csrftoken")!.value;
  const users = await (await page.request.get("http://127.0.0.1:8100/api/backoffice/users/?search=student")).json();
  const response = await page.request.post(`http://127.0.0.1:8100/api/backoffice/users/${users.results[0].id}/subscription/`, {headers: {"X-CSRFToken": csrf, Origin: "http://127.0.0.1:3100"}, data: {plan: "padrao", cycle: "mensal", status: "active", current_period_end: new Date(Date.now() + 5 * 86400000).toISOString()}});
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("region", {name: "Resumo geral das assinaturas"})).toBeVisible();
  await page.getByRole("button", {name: "Filtrar vencimentos em 30 dias"}).click();
  await page.getByLabel("Buscar assinaturas", {exact: true}).fill("student");
  await expect(page.getByRole("link", {name: "student", exact: true})).toBeVisible();
  await expect(page).toHaveURL(/expiry=30/);
  await page.reload();
  await expect(page.getByLabel("Buscar assinaturas", {exact: true})).toHaveValue("student");
  await expect(page.getByRole("link", {name: "student", exact: true})).toBeVisible();
  await page.getByLabel("Buscar assinaturas", {exact: true}).fill("inexistente-e2e");
  await expect(page.getByText("Nenhuma assinatura corresponde aos filtros")).toBeVisible();
  await page.getByRole("button", {name: "Limpar filtros", exact: true}).first().click();
  await page.getByRole("button", {name: "Editar assinatura de student"}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Status", {exact: true}).click();
  await page.getByRole("option", {name: "Canceladas", exact: true}).click();
  await dialog.getByRole("button", {name: "Salvar assinatura"}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("table").getByText("Cancelada", {exact: true})).toBeVisible();
  await page.screenshot({path: "/tmp/admin-assinaturas-desktop.png", fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.reload();
  await expect(page.getByRole("link", {name: "student", exact: true})).toBeVisible();
  await expect(page.getByRole("link", {name: "Atribuir a um usuário"})).toHaveAttribute("href", "/admin/usuarios");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path: "/tmp/admin-assinaturas-mobile.png", fullPage: true});
  expect(errors).toEqual([]);
});

test("subscriptions standard hides financial metrics without permission", async ({page}) => {
  await login(page, "limited");
  await expect(page.getByRole("button", {name: "Filtrar assinaturas vigentes"})).toBeVisible();
  await expect(page.getByRole("link", {name: "student", exact: true})).toBeVisible();
  await expect(page.getByText("MRR estimado", {exact: true})).toHaveCount(0);
});
