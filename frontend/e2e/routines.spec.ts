import { test, expect, Page } from "@playwright/test";

async function login(page: Page, user = "admin") {
  await page.goto("/login?next=%2Fadmin%2Frotinas");
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page).toHaveURL(url => url.pathname === "/admin/rotinas");
}

test("create and edit routine schedule without running it and use mobile diagnostics", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await page.getByRole("button", { name: "Adicionar agendamento", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do agendamento").fill("Backup extra E2E");
  await dialog.getByLabel(/Rotina do agendamento/).selectOption("backup");
  await dialog.getByLabel("Horário", { exact: true }).fill("22:10");
  await dialog.getByRole("button", { name: "Salvar agendamento", exact: true }).click();
  await expect(dialog).toBeHidden();
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Backup extra E2E", exact: true }) });
  await expect(card).toContainText("22:10");
  await card.getByRole("button", { name: "Editar Backup extra E2E" }).click();
  await dialog.getByLabel("Horário", { exact: true }).fill("23:25");
  await dialog.getByLabel("Agendamento ativo").uncheck();
  await dialog.getByRole("button", { name: "Salvar agendamento", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Pausado");
  await expect(card).toContainText("23:25");
  await page.goto("/plataform/rotinas");
  await expect(page).toHaveURL(url => url.pathname === "/admin/rotinas");
  await expect(page.getByRole("heading", { name: "Backup extra E2E", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator("aside").boundingBox())?.x).toBeLessThanOrEqual(-255);
  await page.getByRole("tab", { name: "Diagnósticos", exact: true }).click();
  await expect(page.getByText("Nenhuma execução encontrada para os filtros.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/tmp/routines-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("diagnostics shows success and failure and opens redacted error log", async ({ page }) => {
  const base = { schedule_id: 1, routine: "publish_news", scheduled_for: "2026-11-01T12:00:00Z", started_at: "2026-11-01T12:00:00Z", finished_at: "2026-11-01T12:00:01Z", duration_ms: 1000, log_truncated: false };
  const rows = [{ ...base, id: 2, schedule_name: "Publicação com erro E2E", status: "error" }, { ...base, id: 1, schedule_name: "Publicação concluída E2E", status: "success" }];
  await page.route("**/api/backoffice/routine-executions/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/2/")) return route.fulfill({ json: { ...rows[0], log: "ERROR Falha sintética. token=[redigido]" } });
    const status = url.searchParams.get("status");
    const results = rows.filter(row => !status || row.status === status);
    await route.fulfill({ json: { count: results.length, results, summary: { success: 1, error: 1, running: 0, interrupted: 0 }, can_view_logs: true } });
  });
  await login(page);
  await page.getByRole("tab", { name: "Diagnósticos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Publicação concluída E2E", exact: true })).toBeVisible();
  await page.getByLabel(/Status da execução/).selectOption("error");
  await expect(page.getByRole("heading", { name: "Publicação concluída E2E", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Consultar log da execução 2" }).click();
  await expect(page.getByRole("dialog").getByText("ERROR Falha sintética. token=[redigido]", { exact: true })).toBeVisible();
});

test("ordinary staff cannot manage routine schedules", async ({ page }) => {
  await login(page, "limited");
  await expect(page.getByRole("alert").filter({ hasText: /permissão/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar agendamento", exact: true })).toHaveCount(0);
});
