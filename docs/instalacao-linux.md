# Instalação local no Linux

Este guia foi escrito para **Ubuntu/Debian**. Em Fedora, Arch ou outra distribuição, os nomes dos pacotes variam; a lógica é a mesma. Use o aplicativo **Terminal** e copie um bloco por vez.

## 1. O que será instalado

| Programa | Finalidade | Download/documentação oficial |
| --- | --- | --- |
| Git | baixar o projeto e registrar alterações | [git-scm.com/download/linux](https://git-scm.com/download/linux) |
| Python 3.12 ou superior | backend Django | [python.org/downloads](https://www.python.org/downloads/) |
| Node.js LTS | frontend Next.js | [nodejs.org/en/download](https://nodejs.org/en/download) |
| PostgreSQL (opcional no estado atual) | banco de dados futuro | [postgresql.org/download/linux](https://www.postgresql.org/download/linux/) |

O ambiente local padrão usa SQLite, então PostgreSQL não é obrigatório para iniciar o projeto.

## 2. Atualizar o sistema e instalar ferramentas básicas

No Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip curl
```

O `sudo` pedirá a senha do seu usuário Linux. Enquanto digita, não aparecem caracteres na tela; é normal.

Valide as instalações:

```bash
git --version
python3 --version
```

Se sua distribuição oferecer Python anterior a 3.12, instale uma versão atual pelo método recomendado pela própria distribuição antes de continuar.

## 3. Instalar Node.js LTS

O modo mais simples é baixar o pacote LTS na página oficial do Node.js. Depois de instalar, abra um novo Terminal e valide:

```bash
node --version
npm --version
```

Em Ubuntu/Debian, também é possível seguir as instruções específicas exibidas em [NodeSource](https://github.com/nodesource/distributions), usando sempre uma versão LTS.

## 4. Configurar Git

Execute uma única vez neste computador, substituindo os dados de exemplo:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
git config --global init.defaultBranch main
git config --global --list
```

Seu nome e e-mail serão associados aos commits feitos por você. Isso não publica alterações automaticamente.

## 5. PostgreSQL (opcional)

O projeto ainda usa SQLite localmente. Instale PostgreSQL apenas se deseja deixá-lo disponível para desenvolvimento futuro:

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

Se o estado mostrar `active (running)`, a instalação foi concluída. Para abrir o console administrativo:

```bash
sudo -u postgres psql
```

Para sair:

```sql
\q
```

Essa instalação não altera o banco do projeto sem uma mudança posterior em sua configuração Django.

## 6. Clonar o projeto

Escolha uma pasta para seus projetos:

```bash
cd ~
mkdir -p Projetos
cd Projetos
git clone https://github.com/guedes-jr/Django-Nextjs_ConectadoEmConcursos.git
cd Django-Nextjs_ConectadoEmConcursos
```

Confirme:

```bash
ls
```

Devem aparecer as pastas `backend`, `frontend` e `docs`.

## 7. Criar os arquivos de ambiente

Na raiz do projeto:

```bash
cp .env.example backend/.env
printf 'NEXT_PUBLIC_API_BASE_URL=http://localhost:8000\nNEXT_PUBLIC_BACKEND_URL=http://localhost:8000\n' > frontend/.env.local
```

`backend/.env` guarda configurações locais. Não inclua esse arquivo em commits e não publique senhas ou chaves de API nele.

## 8. Instalar dependências do backend

Na raiz do projeto:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt
```

Depois crie as tabelas locais e seu acesso administrativo:

```bash
cd backend
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser
```

Informe usuário, e-mail e senha quando solicitado. A senha não é exibida na tela.

## 9. Instalar e iniciar o frontend

Abra um segundo Terminal:

```bash
cd ~/Projetos/Django-Nextjs_ConectadoEmConcursos/frontend
npm ci
npm run dev:frontend
```

Mantenha esse terminal aberto enquanto utiliza o sistema.

## 10. Iniciar o backend

No primeiro Terminal, dentro de `backend`:

```bash
.venv/bin/python manage.py runserver
```

Mantenha também esse terminal aberto.

## 11. Acessar no navegador

- Sistema: [http://localhost:3000](http://localhost:3000)
- Django Admin: [http://localhost:8000/admin/](http://localhost:8000/admin/)

Para interromper qualquer servidor, pressione `Ctrl + C` no terminal dele.

## Problemas comuns

### Permissão negada

Não use `sudo` para instalar pacotes Python ou npm dentro do projeto. Se uma pasta foi criada com dono errado, pare e corrija a propriedade antes de continuar.

### `python3-venv` ausente

No Ubuntu/Debian, execute novamente:

```bash
sudo apt install -y python3-venv
```

### A porta 3000 ou 8000 está ocupada

Encontre o processo e encerre-o ou pare o terminal que já iniciou o servidor:

```bash
lsof -i :3000
lsof -i :8000
```

### Atualizar o projeto

Na raiz:

```bash
git pull
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd frontend && npm ci
cd ../backend && .venv/bin/python manage.py migrate
```
