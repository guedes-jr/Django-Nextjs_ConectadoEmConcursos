import {test, expect, Page} from "@playwright/test";
async function login(page:Page, route:string, user="admin") {
  await page.goto(`/login?next=${encodeURIComponent(route)}`);
  await page.locator('input[autocomplete="email"]').first().fill(`${user}@example.test`);
  await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");
  await page.getByRole("button",{name:"Entrar",exact:true}).first().click();
  await expect(page).toHaveURL(url=>url.pathname===route);
}
async function post(page:Page,path:string,data:Record<string,unknown>) {
  const csrf=(await page.context().cookies()).find(cookie=>cookie.name==="csrftoken")!.value;
  return page.request.post(`http://127.0.0.1:8100${path}`,{headers:{"X-CSRFToken":csrf,Origin:"http://127.0.0.1:3100"},data});
}

test("concursos standard creates, restores search and confirms archival",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await login(page,"/admin/concursos");
  await page.getByRole("button",{name:"Novo concurso",exact:true}).first().click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Título").fill("Concurso de revisão E2E");
  await dialog.getByLabel("Órgão",{exact:true}).fill("Órgão E2E");
  await dialog.getByLabel("UF",{exact:true}).fill("se");
  await dialog.getByRole("button",{name:"Salvar concurso"}).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Buscar concursos",{exact:true}).fill("Órgão E2E");
  await expect(page.getByRole("table").getByText("Concurso de revisão E2E",{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Buscar concursos",{exact:true})).toHaveValue("Órgão E2E");
  await page.getByRole("button",{name:"Arquivar concurso Concurso de revisão E2E",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Arquivar concurso"})).toBeVisible();
  await dialog.getByRole("button",{name:"Confirmar",exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("table").getByText("Arquivado",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Filtrar arquivados",exact:true}).click();
  await expect(page.getByRole("table").getByText("Concurso de revisão E2E",{exact:true})).toBeVisible();
  await page.getByLabel("Buscar concursos",{exact:true}).fill("inexistente-e2e");
  await expect(page.getByText("Nenhum concurso corresponde aos filtros")).toBeVisible();
  await page.getByRole("button",{name:"Limpar filtros",exact:true}).first().click();
  await expect(page.getByRole("table").getByText("Concurso de revisão E2E",{exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/admin-concursos-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.reload();
  await expect(page.getByRole("table").getByText("Concurso de revisão E2E",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:"/tmp/admin-concursos-mobile.png",fullPage:true});
  expect(errors).toEqual([]);
});

test("provas standard preserves fields and links, edits year and confirms publication",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await login(page,"/admin/provas");
  const response=await post(page,"/api/backoffice/content/editorial/concursos/",{title:"Vínculo Provas E2E",organization:"TJ"});expect(response.status()).toBe(201);
  await page.reload();
  await page.getByRole("button",{name:"Nova prova",exact:true}).first().click();
  const dialog=page.getByRole("dialog");
  await dialog.getByLabel("Título").fill("Prova de revisão E2E");
  await dialog.getByLabel("Banca",{exact:false}).fill("FGV");
  await dialog.getByLabel("Ano",{exact:false}).fill("2025");
  await dialog.getByLabel("Nível",{exact:true}).fill("Superior");
  await dialog.getByLabel("UF",{exact:true}).fill("SE");
  await dialog.getByLabel("Concurso vinculado",{exact:true}).click();
  await page.getByRole("option",{name:"Vínculo Provas E2E",exact:true}).click();
  await dialog.getByRole("button",{name:"Salvar prova"}).click();await expect(dialog).toBeHidden();
  await expect(page.getByRole("table").getByText("Vínculo Provas E2E",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Editar prova Prova de revisão E2E",exact:true}).click();
  await expect(dialog.getByLabel("Nível",{exact:true})).toHaveValue("Superior");
  await expect(dialog.getByLabel("UF",{exact:true})).toHaveValue("SE");
  await dialog.getByLabel("Ano",{exact:false}).fill("2026");
  await dialog.getByRole("button",{name:"Salvar prova"}).click();await expect(dialog).toBeHidden();
  await expect(page.getByRole("table").getByText("FGV · 2026 · SE",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Publicar prova Prova de revisão E2E",exact:true}).click();
  await dialog.getByRole("button",{name:"Confirmar",exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.getByRole("table").getByText("Publicado",{exact:true})).toBeVisible();
  await page.getByLabel("Buscar provas",{exact:true}).fill("FGV");await expect(page).toHaveURL(/search=FGV/);
  await page.reload();await expect(page.getByLabel("Buscar provas",{exact:true})).toHaveValue("FGV");
  await expect(page.getByRole("table").getByText("Prova de revisão E2E",{exact:true})).toBeVisible();
  await page.screenshot({path:"/tmp/admin-provas-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.reload();
  await expect(page.getByRole("table").getByText("Prova de revisão E2E",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:"/tmp/admin-provas-mobile.png",fullPage:true});expect(errors).toEqual([]);
});

test("reviewers see concursos and provas without write actions",async({page,browser})=>{
  await login(page,"/admin/concursos");
  const response=await post(page,"/api/backoffice/staff/",{username:"reviewer-catalog",email:"reviewer-catalog@example.test",password:"E2e-only!Password-482",role:"reviewer"});expect(response.status()).toBe(201);
  const context=await browser.newContext();const reviewer=await context.newPage();
  await login(reviewer,"/admin/concursos","reviewer-catalog");
  await expect(reviewer.getByRole("table").getByText("Concurso de revisão E2E",{exact:true})).toBeVisible();
  await expect(reviewer.getByRole("button",{name:"Novo concurso",exact:true})).toHaveCount(0);
  await expect(reviewer.getByRole("button",{name:/Arquivar concurso/})).toHaveCount(0);
  await reviewer.goto("/admin/provas");
  await expect(reviewer.getByRole("table").getByText("Prova de revisão E2E",{exact:true})).toBeVisible();
  await expect(reviewer.getByRole("button",{name:"Nova prova",exact:true})).toHaveCount(0);
  await expect(reviewer.getByRole("button",{name:/Editar prova/})).toHaveCount(0);await context.close();
});
