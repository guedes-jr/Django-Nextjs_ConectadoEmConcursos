import { test as base, expect, Page } from "@playwright/test";

// Unexpected browser failures fail the test; raw production telemetry is not collected.
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({page}, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    page.on("console", message => {
      if (message.type() === "error" && message.text().includes('"event":"ui.render_error"')) errors.push("RenderBoundary");
    });
    await use(errors);
    expect(errors, "Uncaught browser errors").toEqual([]);
  }, {auto: true}],
});

async function login(page: Page, user: "student" | "limited" | "admin", next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page).toHaveURL(url => url.pathname === next);
}

test("anonymous admin access requires login", async ({page}) => {
  await page.goto("/admin/relatorios/negocio");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("invalid login displays an error", async ({page}) => {
  await page.goto("/login");
  await page.locator('input[autocomplete="email"]').first().fill("unknown@example.test");
  await page.locator('input[autocomplete="current-password"]').fill("invalid-password");
  await page.getByRole("button", {name: "Entrar", exact: true}).first().click();
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

test("student selects a free plan and payment outage preserves access", async ({page}) => {
  await login(page, "student", "/plans");
  await page.getByRole("button", {name: "Selecionar", exact: true}).click();
  await expect(page.getByText("Plano gratuito ativado.")).toBeVisible();
  await expect(page.getByText("Acesso ativo", {exact: false})).toBeVisible();
  await page.getByRole("button", {name: "Assinar", exact: true}).first().click();
  await expect(page.getByText("Pagamento ainda não configurado; nenhuma cobrança foi iniciada.")).toBeVisible();
  await expect(page.getByRole("button", {name: "Plano atual", exact: true})).toBeDisabled();
});

test("financial administrator reads confirmed receipts and exports the same period", async ({page}) => {
  await login(page, "admin", "/admin/relatorios/negocio");
  await expect(page.getByRole("heading", {name: "Financeiro · BRL"})).toBeVisible();
  await expect(page.getByText("Padrão E2E", {exact: true})).toBeVisible();
  await expect(page.getByText("R$ 123,45", {exact: true}).first()).toBeVisible();
  const exportLink = page.getByRole("link", {name: "Exportar este período em CSV"});
  const url = await exportLink.getAttribute("href");
  expect(url).toContain("since=");
  const response = await page.request.get(url!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain("financial.received_revenue,123.45");
  await page.getByRole("button", {name: "7 dias", exact: true}).click();
  await expect(page.getByText("Padrão E2E", {exact: true})).toBeVisible();
});

test("staff without financial permission sees no money in page or CSV", async ({page}) => {
  await login(page, "limited", "/admin/relatorios/negocio");
  await expect(page.getByText("Indicadores financeiros restritos a administradores com permissão financeira.")).toBeVisible();
  await expect(page.getByRole("heading", {name: "Financeiro · BRL"})).toHaveCount(0);
  const url = await page.getByRole("link", {name: "Exportar este período em CSV"}).getAttribute("href");
  const response = await page.request.get(url!);
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain("financial.received_revenue");
});

test("student cannot access admin APIs", async ({page}) => {
  await login(page, "student", "/plans");
  const response = await page.request.get("http://127.0.0.1:8100/api/backoffice/reports/business/");
  expect(response.status()).toBe(403);
  await page.goto("/admin/relatorios/negocio");
  await expect(page).toHaveURL(/\/dashboard$/);
});


test("student retrieves platform questions and completes a related simulation", async ({page}) => {
  await login(page, "student", "/chatIA");
  await page.getByPlaceholder("Digite sua mensagem").fill("Explique concordância verbal");
  await page.getByRole("button", {name: "Enviar", exact: true}).click();
  await expect(page.getByText("Questões usadas como referência (1)")).toBeVisible();
  await expect(page.getByRole("button", {name: "Salvar material", exact: true})).toHaveCount(0);
  await expect(page.getByRole("link", {name: "Biblioteca de materiais", exact: true})).toHaveCount(0);
  const practice = await page.getByRole("link", {name: "Praticar questões relacionadas"}).getAttribute("href");
  await page.goto(practice!);
  await page.getByRole("button", {name: "Iniciar questões relacionadas", exact: true}).click();
  await expect(page.getByText("Concordância verbal: qual alternativa está correta?", {exact: true})).toBeVisible();
  await page.getByText("Os candidatos estudam.", {exact: true}).click();
  await page.getByRole("button", {name: "Concluir simulado", exact: true}).first().click();
  await expect(page.getByRole("heading", {name: "Você acertou 1 de 1", exact: true})).toBeVisible();
});


test("anonymous material library access redirects to login", async ({page}) => {
  await page.goto("/materials");
  await expect(page).toHaveURL(/\/login\?next=%2Fmaterials/);
});


test("retired material library redirects student to chat without library actions", async ({page}) => {
  await login(page, "student", "/chatIA");
  await page.goto("/materials");
  await expect(page).toHaveURL(/\/chatIA$/);
  await expect(page.getByRole("heading", {name: "Chat de estudos", exact: true})).toBeVisible();
  await expect(page.locator('a[href="/materials"]')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button", {name:"Abrir menu",exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Menu móvel"})).toBeVisible();
  await expect(page.getByRole("link", {name: /Biblioteca de materiais/i})).toHaveCount(0);
});
