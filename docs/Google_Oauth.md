Perfeito — agora está **100% OK**. ✅
Esses `UserWarning` que sobraram vêm **do dj-rest-auth**, não do seu projeto. Eles **não quebram nada** e dá pra ignorar por enquanto.

Vamos seguir para o próximo passo: **subir o backend e preparar o Google OAuth**.

---

## 1) Migrar banco e criar admin

No `backend/`:

```bash
python3 manage.py migrate
python3 manage.py createsuperuser
```

---

## 2) Rodar o servidor

```bash
python3 manage.py runserver
```

Teste rápido:

* `http://localhost:8000/api/health/` → deve retornar `{"status":"ok"}`

---

## 3) Configurar o Google OAuth no Google Cloud

No **Google Cloud Console**:

1. APIs & Services → **Credentials**
2. Create Credentials → **OAuth client ID**
3. Application type: **Web application**
4. Preencha:

### Authorized JavaScript origins

* `http://localhost:8000`
* `http://localhost:3000`

### Authorized redirect URIs

* `http://localhost:8000/api/auth/google/callback/`

Depois copie:

* **Client ID**
* **Client Secret**

---

## 4) Cadastrar o Google no Django Admin (allauth)

Acesse:

* `http://localhost:8000/admin`

### 4.1) Sites

1. Vá em **Sites**
2. Abra o site `example.com`
3. Troque para:

   * Domain: `localhost:8000`
   * Display name: `localhost:8000`
4. Save

### 4.2) Social Applications

1. Vá em **Social applications**
2. Add

   * Provider: **Google**
   * Name: `Google`
   * Client id: (cole)
   * Secret key: (cole)
3. Em **Sites**, adicione `localhost:8000`
4. Save

---

## 5) Testar endpoints de auth

Com o servidor rodando, teste no navegador:

* `http://localhost:8000/api/auth/google/`

Isso deve iniciar o fluxo do Google.

---

## 6) Para o Next (botão de login)

No Next, o botão pode simplesmente mandar o usuário para:

```ts
window.location.href = "http://localhost:8000/api/auth/google/";
```

---

### Antes de eu avançar para o Next e proteção de rotas:

Me confirma 2 coisas (resposta curta):

1. Você está rodando **Django em `http://localhost:8000`** e **Next em `http://localhost:3000`**?
2. O endpoint `http://localhost:8000/api/auth/google/` abre a tela do Google ou dá algum erro?
