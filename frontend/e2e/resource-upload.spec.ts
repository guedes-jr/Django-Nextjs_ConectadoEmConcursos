import {test,expect,Page} from '@playwright/test';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
async function login(page:Page,who:string,next:string){await page.goto(`/login?next=${next}`);await page.locator('input[autocomplete="email"]').first().fill(`${who}@example.test`);await page.locator('input[autocomplete="current-password"]').fill('E2e-only!Password-482');await page.getByRole('button',{name:'Entrar',exact:true}).first().click();await expect(page).toHaveURL(url=>url.pathname===next);}
test('staff uploads, previews and publishes a private PDF for students',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page,'admin','/admin/concursos');
 const csrf=(await page.context().cookies()).find(c=>c.name==='csrftoken')!.value;
 const created=await page.request.post('http://127.0.0.1:8100/api/backoffice/content/editorial/concursos/',{headers:{'X-CSRFToken':csrf,Origin:'http://127.0.0.1:3100'},data:{title:'Concurso para envio de arquivos'}});expect(created.status()).toBe(201);const contest=await created.json();
 await page.reload();await page.getByRole('table').getByRole('row').filter({hasText:'Concurso para envio de arquivos'}).getByRole('button',{name:'Materiais',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Título do material',{exact:true}).fill('Edital em PDF');await dialog.getByLabel('Origem do material',{exact:true}).selectOption('upload');await dialog.getByLabel('Arquivos PDF (até 20 arquivos, 25 MB cada)',{exact:true}).setInputFiles({name:'edital.pdf',mimeType:'application/pdf',buffer:pdf});await dialog.getByRole('button',{name:'Enviar 1 arquivo(s)',exact:true}).click();await expect(dialog.getByText('1 arquivo(s) cadastrado(s).',{exact:true})).toBeVisible();
 const preview=dialog.getByRole('link',{name:'Baixar PDF',exact:true});await expect(preview).toBeVisible();const url=(await preview.getAttribute('href'))!;const response=await page.request.get(url);expect(response.status()).toBe(200);expect(await response.body()).toEqual(pdf);
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3100'});const student=await context.newPage();student.on('pageerror',e=>errors.push(e.message));await login(student,'student',`/concursos/${contest.id}`);await expect(student.getByRole('link',{name:'Baixar PDF',exact:false})).toHaveCount(0);expect((await student.request.get(url)).status()).toBe(404);
 await dialog.getByRole('button',{name:'Editar',exact:true}).click();await expect(dialog.getByLabel('Origem do material',{exact:true})).toHaveValue('upload');await dialog.getByRole('checkbox',{name:'Publicado para os alunos',exact:true}).check();await dialog.getByRole('button',{name:'Salvar material',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Adicionar material',exact:true})).toBeVisible();
 await student.reload();const download=student.getByRole('link').filter({hasText:'Baixar PDF'});await expect(download).toBeVisible();const publicUrl=(await download.getAttribute('href'))!;const downloaded=await student.request.get(publicUrl);expect(downloaded.status()).toBe(200);expect(downloaded.headers()['content-disposition']).toContain('attachment;');expect(downloaded.headers()['cache-control']).toBe('private, no-store');expect(await downloaded.body()).toEqual(pdf);
 await student.setViewportSize({width:390,height:844});expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await student.screenshot({path:'/tmp/concurso-upload-mobile.png',fullPage:true});expect(errors).toEqual([]);await context.close();
});

test('multiple PDFs keep general answer keys on the contest and individual files on each role',async({page,browser})=>{
 await login(page,'admin','/admin/concursos');
 const csrf=(await page.context().cookies()).find(c=>c.name==='csrftoken')!.value;
 const headers={'X-CSRFToken':csrf,Origin:'http://127.0.0.1:3100'};
 const created=await page.request.post('http://127.0.0.1:8100/api/backoffice/content/editorial/concursos/',{headers,data:{title:'Concurso com vários cargos'}});
 expect(created.status()).toBe(201);const contest=await created.json();
 const exams=[];
 for(const role of ['Vigia','Veterinário']){
  const response=await page.request.post('http://127.0.0.1:8100/api/backoffice/content/editorial/provas/',{headers,data:{title:`Prova de ${role}`,role,banca:'FGV',year:2010,concurso:contest.id,is_published:true}});
  expect(response.status()).toBe(201);exams.push(await response.json());
 }
 await page.reload();await page.getByRole('row').filter({hasText:'Concurso com vários cargos'}).getByRole('button',{name:'Materiais',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Origem do material',{exact:true}).selectOption('upload');
 await dialog.getByLabel('Arquivos PDF (até 20 arquivos, 25 MB cada)',{exact:true}).setInputFiles(['geral','vigia','veterinario'].map(name=>({name:`${name}.pdf`,mimeType:'application/pdf',buffer:pdf})));
 for(let i=0;i<3;i++)await dialog.getByLabel(`Tipo do arquivo ${i+1}`,{exact:true}).selectOption(i===0?'answer_key':'exam');
 await dialog.getByLabel('Cargo do arquivo 2',{exact:true}).selectOption(String(exams[0].id));
 await dialog.getByLabel('Cargo do arquivo 3',{exact:true}).selectOption(String(exams[1].id));
 await dialog.getByRole('checkbox',{name:'Publicado para os alunos',exact:true}).check();
 await dialog.getByRole('button',{name:'Enviar 3 arquivo(s)',exact:true}).click();
 await expect(dialog.getByText('3 arquivo(s) cadastrado(s).',{exact:true})).toBeVisible();
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3100'});const student=await context.newPage();
 await login(student,'student',`/concursos/${contest.id}`);
 await expect(student.getByRole('link').filter({has:student.getByText('geral',{exact:true})})).toBeVisible();
 await expect(student.getByText('vigia',{exact:true})).toHaveCount(0);
 await student.getByRole('link').filter({has:student.getByRole('heading',{name:'Vigia',exact:true})}).click();
 await expect(student.getByRole('heading',{name:'Prova e documentos do cargo',exact:true})).toBeVisible();
 await expect(student.getByText('vigia',{exact:true})).toBeVisible();
 await expect(student.getByText('geral',{exact:true})).toBeVisible();
 await expect(student.getByText('veterinario',{exact:true})).toHaveCount(0);
 await context.close();
});
