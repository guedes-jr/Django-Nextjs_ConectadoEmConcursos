import {test,expect,Page} from '@playwright/test';
async function login(page:Page,who:string,next:string){await page.goto(`/login?next=${next}`);await page.locator('input[autocomplete="email"]').first().fill(`${who}@example.test`);await page.locator('input[autocomplete="current-password"]').fill('E2e-only!Password-482');await page.getByRole('button',{name:'Entrar',exact:true}).first().click();await expect(page).toHaveURL(url=>url.pathname===next);}
test('common user opens an editorial article without external URL and reads formatted content',async({page,browser})=>{
 await login(page,'admin','/admin/artigos');
 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==='csrftoken')!.value;
 for(const state of ['published','draft']){
  const result=await page.request.post('http://127.0.0.1:8100/api/backoffice/content/editorial/artigos/',{headers:{'X-CSRFToken':csrf,Origin:'http://127.0.0.1:3100'},data:{title:`Artigo para o aluno ${state}`,body:'<p>Conteúdo com <strong>leitura formatada</strong> para estudar.</p>',editorial_status:state}});
  expect(result.status()).toBe(201);
 }
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3100'});
 const student=await context.newPage();
 const errors:string[]=[];student.on('pageerror',error=>errors.push(error.message));
 await login(student,'student','/artigos');
 await expect(student.getByRole('heading',{name:'Artigos',exact:true})).toBeVisible();
 await expect(student.getByRole('heading',{name:'Notícia automática de concurso'})).toHaveCount(0);
 await student.getByRole('textbox',{name:'Buscar artigo'}).fill('Artigo para o aluno');
 await expect(student.getByRole('heading',{name:'Artigo para o aluno published'})).toBeVisible();
 await expect(student.getByText('Artigo para o aluno draft',{exact:true})).toHaveCount(0);
 await student.getByRole('link',{name:'Ler conteúdo',exact:true}).click();
 await expect(student).toHaveURL(/\/artigos\/artigo-para-o-aluno-published/);
 await expect(student.getByRole('heading',{name:'Artigo para o aluno published'})).toBeVisible();
 await expect(student.locator('strong').filter({hasText:'leitura formatada'})).toBeVisible();
 await expect(student.getByRole('link',{name:'Ler completa na fonte'})).toHaveCount(0);
 await student.setViewportSize({width:390,height:844});
 expect(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await student.screenshot({path:'/tmp/article-reader-mobile.png',fullPage:true});
 await student.goto('/noticias');
 await expect(student.getByRole('heading',{name:'Notícias',exact:true})).toBeVisible();
 await expect(student.getByRole('heading',{name:'Notícia automática de concurso'})).toBeVisible();
 await student.getByRole('link',{name:'Notícia automática de concurso',exact:true}).click();
 await expect(student).toHaveURL(/\/noticias\/noticia-automatica/);
 await expect(student.getByRole('link',{name:'Ler completa na fonte'})).toHaveAttribute('href','https://example.test/noticia');
 await student.getByRole('link',{name:'Voltar para notícias'}).click();
 await student.getByRole('textbox',{name:'Buscar notícia'}).fill('Artigo para o aluno');
 await expect(student.getByText('Nenhuma notícia encontrada.',{exact:true})).toBeVisible();
 await expect(student.getByRole('heading',{name:'Artigo para o aluno published'})).toHaveCount(0);
 expect(errors).toEqual([]);
 await context.close();
});
