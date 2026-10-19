import {test,expect,Page} from '@playwright/test';
async function login(page:Page,email:string,password:string,next:string){await page.goto(`/login?next=${next}`);await page.locator('input[autocomplete="email"]').first().fill(email);await page.locator('input[autocomplete="current-password"]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).first().click();await expect(page).toHaveURL(url=>url.pathname===next);}
test('administrator sets a password directly and the previous student session loses access',async({page,browser})=>{
 const initial='E2e-only!Password-482',changed='E2e-direct!New-password-632';
 await login(page,'admin@example.test',initial,'/admin/usuarios');
 const csrf=(await page.context().cookies()).find(c=>c.name==='csrftoken')!.value;
 const created=await page.request.post('http://127.0.0.1:8100/api/backoffice/users/',{headers:{'X-CSRFToken':csrf,Origin:'http://127.0.0.1:3100'},data:{username:'password-target',email:'password-target@example.test',first_name:'',last_name:'',password:initial}});
 expect(created.status()).toBe(201);
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3100'});const student=await context.newPage();
 // A newly created account has an unverified email, but login may send a verification notice.
 // Exercise the session with the seeded, verified address attached only in the isolated fixture.
 const target=await created.json();
 await page.request.post(`http://127.0.0.1:8100/api/backoffice/users/${target.id}/actions/`,{headers:{'X-CSRFToken':csrf,Origin:'http://127.0.0.1:3100'},data:{action:'verify_email'}});
 await login(student,'password-target@example.test',initial,'/dashboard');
 await page.reload();
 const row=page.getByRole('row').filter({hasText:'password-target@example.test'});
 await row.getByRole('button',{name:'Redefinir senha de password-target',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Nova senha',{exact:true}).fill(changed);await dialog.getByLabel('Confirmar nova senha',{exact:true}).fill('wrong');await dialog.getByLabel('Motivo da redefinição',{exact:true}).fill('Teste de atendimento');
 await dialog.getByRole('button',{name:'Salvar nova senha',exact:true}).click();await expect(dialog.getByRole('alert')).toHaveText('As senhas não coincidem.');
 await dialog.getByLabel('Confirmar nova senha',{exact:true}).fill(changed);await dialog.getByRole('button',{name:'Salvar nova senha',exact:true}).click();await expect(dialog).toHaveCount(0);
 expect((await student.request.get('http://127.0.0.1:8100/api/me/')).status()).toBe(403);
 await login(student,'password-target@example.test',changed,'/dashboard');
 await context.close();
});
