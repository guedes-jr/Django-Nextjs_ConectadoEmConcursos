# Instalação local no macOS

Este guia prepara o **Conectado em Questões** em um Mac. Os comandos devem ser executados no aplicativo **Terminal** (`⌘ + Espaço`, pesquise por “Terminal”). Copie um bloco por vez e pressione Enter.

## 1. Programas necessários

| Programa | Finalidade | Download oficial |
| --- | --- | --- |
| Xcode Command Line Tools / Git | comandos e controle de versão | [Apple Developer](https://developer.apple.com/xcode/resources/) |
| Python 3.12 ou superior | backend Django | [python.org/downloads/macos](https://www.python.org/downloads/macos/) |
| Node.js LTS | frontend Next.js | [nodejs.org/en/download](https://nodejs.org/en/download) |
| PostgreSQL (opcional no estado atual) | banco de dados futuro | [postgresql.org/download/macosx](https://www.postgresql.org/download/macosx/) |

O projeto inicia com SQLite, um banco de arquivo em `backend/db.sqlite3`. PostgreSQL não é necessário para a primeira execução.

## 2. Instalar Git

Abra o Terminal e execute:

```bash
xcode-select --install
```

Uma janela da Apple aparecerá. Clique em **Install**, aceite os termos e espere concluir. Depois valide:

```bash
git --version
```

Se já aparecer uma versão, o Git já estava instalado.

## 3. Configurar sua identidade no Git

Faça isso somente uma vez neste Mac. Troque os valores pelos seus:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
git config --global init.defaultBranch main
git config --global --list
```

O comando final deve listar seu nome e e-mail. Essa configuração não envia nada para a internet.

## 4. Instalar Python

1. Abra o link oficial do Python.
2. Baixe o instalador macOS 64-bit/universal da versão estável.
3. Abra o arquivo `.pkg` baixado e avance mantendo as opções recomendadas.
4. Feche o Terminal e abra outro.

Valide:

```bash
python3 --version
```

Use Python 3.12 ou superior. Não use `sudo pip install` neste projeto.

## 5. Instalar Node.js

1. Abra a página de download do Node.js.
2. Escolha a versão **LTS** adequada ao seu Mac (Apple Silicon ou Intel; o instalador universal normalmente funciona nos dois).
3. Abra o `.pkg` e mantenha as opções padrão.
4. Feche e reabra o Terminal.

Valide:

```bash
node --version
npm --version
```

## 6. PostgreSQL (opcional)

O projeto não usa PostgreSQL por padrão. Caso queira instalá-lo agora:

1. Abra a página oficial de PostgreSQL para macOS e siga o link indicado para o instalador recomendado.
2. Instale a versão estável para a arquitetura do seu Mac.
3. Defina e guarde a senha do usuário administrativo.
4. Mantenha a porta padrão `5432`.

A instalação não muda automaticamente o banco do projeto. Uma futura configuração específica será necessária para trocar SQLite por PostgreSQL.

## 7. Clonar o projeto

No Terminal:

```bash
cd ~
mkdir -p Projetos
cd Projetos
git clone https://github.com/guedes-jr/Django-Nextjs_ConectadoEmConcursos.git
cd Django-Nextjs_ConectadoEmConcursos
```

Confira o conteúdo:

```bash
ls
```

Você deve ver `backend`, `frontend`, `docs` e `Makefile`.

## 8. Criar configurações locais

O arquivo `.env` é particular do seu computador; não o envie ao GitHub.

Na raiz do projeto:

```bash
cp .env.example backend/.env
printf 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8000\nNEXT_PUBLIC_BACKEND_URL=http://localhost:8000\n' > frontend/.env.local
```

Para desenvolvimento normal, mantenha os valores de `localhost` em `backend/.env`. Chaves de API são opcionais e não devem ser compartilhadas.

## 9. Preparar o backend Django

Ainda na raiz:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
```

O último comando pedirá usuário, e-mail e senha para o Django Admin. A senha não aparece enquanto é digitada.

## 10. Preparar e iniciar o frontend

Abra um **segundo Terminal**. Execute:

```bash
cd ~/Projetos/Django-Nextjs_ConectadoEmConcursos/frontend
npm ci
npm run dev:frontend
```

Mantenha esse Terminal aberto. Aguarde a URL `http://localhost:3000`.

## 11. Iniciar o backend

No primeiro Terminal, que está na pasta `backend`, execute:

```bash
.venv/bin/python manage.py runserver
```

Mantenha-o aberto. Aguarde `http://127.0.0.1:8000/`.

## 12. Abrir o projeto

No navegador:

- Sistema: [http://localhost:3000](http://localhost:3000)
- Django Admin: [http://localhost:8000/admin/](http://localhost:8000/admin/)

Pare os servidores com `Control + C` no terminal correspondente.

## Problemas comuns

### `python3` não foi encontrado

Instale o Python pelo link oficial, feche o Terminal e abra-o novamente.

### O macOS bloqueou um instalador

Em **Ajustes do Sistema → Privacidade e Segurança**, use a opção para permitir a abertura apenas se você baixou o arquivo do site oficial.

### `npm ci` falhou

Confirme `node --version`. Reinstale a edição LTS do Node.js se necessário e rode `npm ci` outra vez.

### Atualizar depois

Na raiz do projeto:

```bash
git pull
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend && npm ci
cd ../backend && .venv/bin/python manage.py migrate
```
