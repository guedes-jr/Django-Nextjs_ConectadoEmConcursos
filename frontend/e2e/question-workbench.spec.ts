import {test,expect,Page} from "@playwright/test";
async function login(page:Page,path:string){await page.goto(`/login?next=${encodeURIComponent(path)}`);await page.locator('input[autocomplete="email"]').first().fill("admin@example.test");await page.locator('input[autocomplete="current-password"]').fill("E2e-only!Password-482");await page.getByRole("button",{name:"Entrar",exact:true}).first().click();await expect(page).toHaveURL(url=>url.pathname===path);}
async function post(page:Page,path:string,data:Record<string,unknown>){const csrf=(await page.context().cookies()).find(cookie=>cookie.name==="csrftoken")!.value;return page.request.post(`http://127.0.0.1:8100${path}`,{headers:{"X-CSRFToken":csrf,Origin:"http://127.0.0.1:3100"},data});}

test("question catalog creates draft, sends to review and opens the exact question",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await login(page,"/admin/questoes");await page.getByRole("button",{name:"Nova questão",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.locator('[contenteditable="true"]').fill("Questão dedicada de revisão E2E");
 await dialog.getByPlaceholder("Pesquisar banca").fill("FGV");await dialog.getByRole("button",{name:"FGV",exact:true}).click();
 await dialog.getByPlaceholder("Pesquisar disciplina").fill("Português");await dialog.getByRole("button",{name:"Português",exact:true}).click();
 await dialog.getByLabel("Alternativas",{exact:true}).fill("Alternativa correta\nAlternativa incorreta");
 await dialog.getByRole("button",{name:"Salvar rascunho",exact:true}).click();await expect(dialog).toBeHidden();
 await page.getByLabel("Buscar questões",{exact:true}).fill("Questão dedicada de revisão E2E");
 await expect(page.getByRole("status").filter({hasText:"1 registro encontrado"})).toBeVisible();
 await page.reload();await expect(page.getByLabel("Buscar questões",{exact:true})).toHaveValue("Questão dedicada de revisão E2E");
 await page.getByRole("button",{name:"Enviar à fila",exact:true}).click();await dialog.getByRole("button",{name:"Confirmar",exact:true}).click();await expect(dialog).toBeHidden();
 const review=page.getByRole("link",{name:"Revisar",exact:true});const href=await review.getAttribute("href");expect(href).toContain("questao=");await review.click();
 await expect(page.getByText("Questão dedicada de revisão E2E",{exact:true}).last()).toBeVisible();
 await page.getByLabel("Comentário da questão",{exact:true}).fill("A primeira alternativa apresenta a resposta correta ao enunciado, enquanto a segunda contradiz a regra examinada. A comparação entre as opções confirma o gabarito indicado.");
 await page.getByRole("button",{name:/^Aprovar/}).click();
 await expect(page.getByText("Aprovada por admin.",{exact:true})).toBeVisible();
 await page.goto("/admin/questoes");await page.getByLabel("Buscar questões",{exact:true}).fill("Questão dedicada de revisão E2E");
 await expect(page.getByRole("table").getByText("Aprovada",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:/Excluir questão/}).click();await expect(page.getByRole("dialog").getByRole("button",{name:"Confirmar",exact:true})).toBeDisabled();await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click();
 await page.screenshot({path:"/tmp/admin-questoes-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByRole("table").getByText("Aprovada",{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await page.screenshot({path:"/tmp/admin-questoes-mobile.png",fullPage:true});expect(errors).toEqual([]);
});

test("review workbench preserves notes, guards navigation and keeps shortcuts opt in",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));await login(page,"/admin/fila-questoes");
 const ids:number[]=[];
 for(let index=0;index<2;index++){const response=await post(page,"/api/backoffice/content/questions/manual/",{statement:`Rascunho protegido E2E ${index}`,banca:"FGV",discipline:"Português",year:2026,options:["Resposta A","Resposta B"],correct_answer:0});expect(response.status()).toBe(201);const item=await response.json();ids.push(item.id);expect((await post(page,`/api/backoffice/content/questions/manual/${item.id}/submit/`,{})).status()).toBe(200);}
 await page.reload();await page.getByLabel("Buscar na fila",{exact:true}).fill("Rascunho protegido E2E");
 await page.getByRole("button",{name:new RegExp(`#${ids[0]}\\b`)}).click();
 await page.getByLabel("Comentário da questão",{exact:true}).fill("Comentário que precisa ser preservado.");
 await expect(page.getByLabel("Buscar na fila",{exact:true})).toBeDisabled();
 await page.getByRole("button",{name:new RegExp(`#${ids[1]}\\b`)}).click();
 const dialog=page.getByRole("dialog");await expect(dialog.getByRole("heading",{name:"Descartar comentário não salvo?"})).toBeVisible();await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();
 await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("Comentário que precisa ser preservado.");
 await page.getByRole("button",{name:"Salvar rascunho S",exact:true}).click();await expect(page.getByLabel("Buscar na fila",{exact:true})).toBeEnabled();
 await page.getByRole("button",{name:new RegExp(`#${ids[1]}\\b`)}).click();await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("");
 await page.getByRole("button",{name:new RegExp(`#${ids[0]}\\b`)}).click();await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("Comentário que precisa ser preservado.");
 await expect(page.getByLabel("Ativar atalhos de revisão",{exact:true})).not.toBeChecked();await page.locator("body").press("a");await expect(page.getByRole("button",{name:/^Aprovar/})).toBeDisabled();
 await page.getByLabel("Comentário da questão",{exact:true}).fill("Anotação local em conflito que não pode desaparecer.");
 await page.route("**/api/backoffice/content/questions/draft/",route=>route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:"stale",detail:"Alterada por outro revisor"})}));
 await page.getByRole("button",{name:"Salvar rascunho S",exact:true}).click();await expect(page.getByText(/Seu comentário permanece nesta tela/)).toBeVisible();await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("Anotação local em conflito que não pode desaparecer.");
 await page.getByRole("link",{name:"Usuários",exact:true}).click();await expect(page.getByRole("dialog").getByRole("heading",{name:"Descartar comentário não salvo?"})).toBeVisible();await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click();
 await page.getByRole("button",{name:"Descartar alterações",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Confirmar",exact:true}).click();await page.unroute("**/api/backoffice/content/questions/draft/");
 await page.getByLabel("Fonte",{exact:true}).click();await page.getByRole("option",{name:"Cadastro manual",exact:true}).click();await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("Comentário que precisa ser preservado.");
 await page.screenshot({path:"/tmp/admin-fila-desktop.png",fullPage:true});await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByLabel("Comentário da questão",{exact:true})).toHaveValue("Comentário que precisa ser preservado.");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await page.screenshot({path:"/tmp/admin-fila-mobile.png",fullPage:true});expect(errors).toEqual([]);
});
