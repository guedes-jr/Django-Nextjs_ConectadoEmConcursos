# Instalação local no Windows

Este guia prepara o **Conectado em Questões** no Windows para desenvolvimento. Não é necessário saber programar previamente: siga os passos na ordem e copie os comandos exatamente como aparecem.

> Use o **Git Bash** para todos os comandos deste guia. Ele é instalado junto com o Git e tem um ícone de terminal preto.

## 1. O que será instalado

| Programa | Para que serve | Download oficial |
| --- | --- | --- |
| Git for Windows (inclui Git Bash) | baixar o projeto e registrar alterações | [git-scm.com/download/win](https://git-scm.com/download/win) |
| Python 3.12 ou superior | executar o backend Django | [python.org/downloads/windows](https://www.python.org/downloads/windows/) |
| Node.js LTS | executar o frontend Next.js | [nodejs.org/en/download](https://nodejs.org/en/download) |
| PostgreSQL (opcional no estado atual) | banco de dados para uso futuro | [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) |

O projeto usa **SQLite localmente por padrão**. Logo, PostgreSQL pode ser instalado agora, mas não precisa ser configurado para a primeira execução.

## 2. Instalar o Git e abrir o Git Bash

1. Abra o link do Git e baixe o instalador de 64 bits.
2. Execute o arquivo baixado. Nas telas do instalador, mantenha as opções padrão.
3. Na tela **Adjusting your PATH environment**, escolha a opção recomendada: **Git from the command line and also from 3rd-party software**.
4. Conclua a instalação.
5. No menu Iniciar, pesquise por **Git Bash** e abra-o.

Teste se funcionou:

```bash
git --version
```

Deve aparecer algo parecido com `git version 2.x.x`.

## 3. Configurar sua identidade no Git

Esta etapa é feita uma única vez por computador. Troque o nome e o e-mail pelos seus:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
git config --global init.defaultBranch main
git config --global --list
```

O último comando deve mostrar `user.name` e `user.email`. Nunca informe senha do GitHub nesses comandos.

## 4. Instalar Python

1. Abra a página do Python e baixe a versão estável para Windows (64 bits).
2. Abra o instalador.
3. **Muito importante:** na primeira tela marque a caixa **Add python.exe to PATH**.
4. Clique em **Install Now** e aguarde.
5. Feche e abra o Git Bash novamente.

Valide:

```bash
py --version
python --version
```

Se `python` não funcionar, use `py` nos comandos do Windows. Se ambos falharem, reinstale marcando a opção do PATH.

## 5. Instalar Node.js

1. Abra a página do Node.js.
2. Baixe a versão marcada como **LTS** (mais estável).
3. Execute o instalador e mantenha as opções padrão.
4. Feche e abra novamente o Git Bash.

Valide:

```bash
node --version
npm --version
```

## 6. PostgreSQL (opcional)

O código atual usa um arquivo local `backend/db.sqlite3`; por isso, pule esta seção se seu objetivo for apenas executar o projeto.

Para instalar PostgreSQL para estudos ou uso futuro:

1. Abra o link oficial e escolha **Download the installer** para Windows.
2. Execute o instalador da EDB.
3. Mantenha os componentes **PostgreSQL Server** e **pgAdmin 4** selecionados.
4. Anote a senha definida para o usuário `postgres`; ela não pode ser recuperada automaticamente.
5. Mantenha a porta padrão `5432`.
6. Finalize a instalação.

No menu Iniciar, abra **SQL Shell (psql)**. Pressione Enter para aceitar host, banco, porta e usuário padrão; digite a senha quando solicitada. Para sair, use:

```sql
\q
```

## 7. Baixar o projeto

No Git Bash, vá para uma pasta onde você guarda projetos. O comando abaixo cria/usa a pasta `Projetos` dentro da sua pasta de usuário:

```bash
cd ~
mkdir -p Projetos
cd Projetos
git clone https://github.com/guedes-jr/Django-Nextjs_ConectadoEmConcursos.git
cd Django-Nextjs_ConectadoEmConcursos
```

Confira se você está na pasta correta:

```bash
pwd
ls
```

Você deve ver, entre outros, `backend`, `frontend`, `docs` e `Makefile`.

## 8. Criar o arquivo de configuração local

O arquivo `.env` contém configurações locais e **não deve ser enviado ao GitHub**.

Ainda na raiz do projeto, execute:

```bash
cp .env.example backend/.env
```

Abra `backend/.env` no VS Code ou Bloco de Notas. Para uso local padrão, mantenha `DJANGO_ENV=development`, as URLs com `localhost` e não preencha chaves reais que não possua.

Crie também a configuração do frontend:

```bash
printf 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8000\nNEXT_PUBLIC_BACKEND_URL=http://localhost:8000\n' > frontend/.env.local
```

## 9. Instalar o backend

Na raiz do projeto, execute os comandos abaixo, um por vez:

```bash
py -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install --upgrade pip
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
```

O ambiente `.venv` isola os pacotes deste projeto dos demais programas do computador.

## 10. Criar o banco local

Entre na pasta do backend e aplique as migrations:

```bash
cd backend
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py createsuperuser
```

No comando `createsuperuser`, informe usuário, e-mail e senha. A senha não aparece na tela enquanto você digita; isso é normal.

## 11. Instalar e iniciar o frontend

Abra **outro** Git Bash. Não feche o primeiro, pois ele será usado pelo backend.

No novo terminal:

```bash
cd ~/Projetos/Django-Nextjs_ConectadoEmConcursos/frontend
npm ci
npm run dev:frontend
```

Espere aparecer a URL `http://localhost:3000`.

## 12. Iniciar o backend

No primeiro Git Bash, que está dentro de `backend`, execute:

```bash
.venv/Scripts/python.exe manage.py runserver
```

Espere a mensagem contendo `http://127.0.0.1:8000/`.

## 13. Abrir e testar

Abra no navegador:

- Aplicação: [http://localhost:3000](http://localhost:3000)
- Administração Django: [http://localhost:8000/admin/](http://localhost:8000/admin/)

Entre no Django Admin com o superusuário criado no passo 10.

Para parar um servidor, clique no terminal correspondente e pressione `Ctrl + C`.

## Problemas comuns

### `py` ou `python` não é reconhecido

Feche todos os terminais e abra um novo Git Bash. Se persistir, reinstale Python e marque **Add python.exe to PATH**.

### `npm` não é reconhecido

Feche e abra o Git Bash após instalar Node.js. Se persistir, reinstale a versão LTS.

### A porta 8000 ou 3000 já está em uso

Feche o terminal que já está executando o servidor ou use `Ctrl + C` nele. Depois tente novamente.

### O navegador mostra erro ao carregar dados

Confirme que os dois terminais continuam abertos: um com `runserver` (porta 8000) e outro com `npm run dev:frontend` (porta 3000).

### Quero atualizar o projeto depois

Na raiz do projeto:

```bash
git pull
```

Depois instale dependências e migrations que possam ter mudado:

```bash
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd frontend && npm ci
cd ../backend && .venv/Scripts/python.exe manage.py migrate
```
