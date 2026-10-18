import { test, expect, Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login?next=%2Fadmin%2Fusuarios");
  await page.locator('input[autocomplete="email"]').first().fill("admin@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
}

test("users standard creates, searches, restores filters and confirms blocking", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await expect(page.getByRole("region", {name: "Resumo geral dos usuários"})).toBeVisible();
  await page.getByRole("button", {name: "Novo usuário", exact: true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome de usuário").fill("usuario-padrao-e2e");
  await dialog.getByLabel("E-mail").fill("usuario-padrao@example.test");
  await dialog.getByLabel("Senha inicial").fill("E2e-only!Password-482");
  await dialog.getByRole("button", {name: "Criar usuário", exact: true}).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Buscar usuários", {exact: true}).fill("usuario-padrao-e2e");
  const row = page.getByRole("row").filter({has: page.getByRole("link", {name: "usuario-padrao-e2e", exact: true})});
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/search=usuario-padrao-e2e/);
  await page.reload();
  await expect(page.getByLabel("Buscar usuários", {exact: true})).toHaveValue("usuario-padrao-e2e");
  await expect(row).toBeVisible();
  await row.getByRole("button", {name: "Bloquear", exact: true}).click();
  await expect(dialog.getByRole("button", {name: "Confirmar bloqueio"})).toBeDisabled();
  await dialog.getByLabel("Motivo do bloqueio").fill("Bloqueio sintético de validação");
  await dialog.getByRole("button", {name: "Confirmar bloqueio"}).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText("Bloqueado", {exact: true})).toBeVisible();
  await page.getByRole("button", {name: "Filtrar usuários bloqueados"}).click();
  await expect(row).toBeVisible();
  await page.getByLabel("Buscar usuários", {exact: true}).fill("usuario-inexistente-e2e");
  await expect(page.getByText("Nenhum usuário corresponde aos filtros")).toBeVisible();
  await page.getByRole("button", {name: "Limpar filtros", exact: true}).first().click();
  await expect(row).toBeVisible();
  await page.screenshot({path: "/tmp/admin-usuarios-desktop.png", fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.reload();
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", {name: "Novo usuário", exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path: "/tmp/admin-usuarios-mobile.png", fullPage: true});
  expect(errors).toEqual([]);
});

test("users standard paginates matching users on the server", async ({page}) => {
  await login(page);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === "csrftoken")!.value;
  for (let index = 0; index < 13; index++) {
    const response = await page.request.post("http://127.0.0.1:8100/api/backoffice/users/", {headers: {"X-CSRFToken": csrf, "Origin": "http://127.0.0.1:3100"}, data: {username: `paginacao-e2e-${String(index).padStart(2, "0")}`, email: `paginacao-${index}@example.test`, password: "E2e-only!Password-482"}});
    expect(response.status()).toBe(201);
  }
  await page.getByLabel("Buscar usuários", {exact: true}).fill("paginacao-e2e");
  await expect(page.getByRole("status").filter({hasText: "13 registros encontrados"})).toBeVisible();
  await expect(page.getByRole("table", {name: "Lista de usuários"}).getByRole("row")).toHaveCount(13);
  await page.getByRole("button", {name: "Próxima", exact: true}).click();
  await expect(page.getByText("Exibindo 13–13 de 13")).toBeVisible();
  await expect(page.getByRole("table", {name: "Lista de usuários"}).getByRole("row")).toHaveCount(2);
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", {name: "Anterior", exact: true}).click();
  await expect(page.getByText("Exibindo 1–12 de 13")).toBeVisible();
});
