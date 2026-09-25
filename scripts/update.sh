#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

# ============================================================
# Conectado em Concursos
# Atualização segura de produção
# ============================================================

APP_NAME="Conectado em Concursos"

PROJECT_DIR="/var/www/conectado-em-concursos"
BACKEND_DIR="${PROJECT_DIR}/backend"
FRONTEND_DIR="${PROJECT_DIR}/frontend"
VENV_DIR="${BACKEND_DIR}/.venv"

BRANCH="main"

DJANGO_SERVICE="conectado-concursos-django.service"
NEXT_SERVICE="conectado-concursos-next.service"
REDIS_SERVICE="redis-server.service"

DOMAIN="https://conectadoemconcursos.com"

LOCK_FILE="/tmp/conectado-concursos-update.lock"

LOG_DIR="/home/deploy/logs/conectado-concursos"
LOG_FILE="${LOG_DIR}/update-$(date '+%Y%m%d-%H%M%S').log"

PYTHON="${VENV_DIR}/bin/python"

GIT="$(command -v git)"
NPM="$(command -v npm)"
CURL="$(command -v curl)"
FLOCK="$(command -v flock)"
APT_GET="$(command -v apt-get || true)"
SYSTEMCTL="/usr/bin/systemctl"


# ============================================================
# Funções
# ============================================================

log() {
    echo
    echo "=================================================================="
    echo "[$(date '+%d/%m/%Y %H:%M:%S')] $1"
    echo "=================================================================="
}

erro() {
    echo
    echo "ERRO: $1"
    echo
    echo "Consulte o log:"
    echo "$LOG_FILE"
    echo
    exit 1
}


# Executa manage.py em ambiente limpo.
#
# Não usamos:
#
#   source backend/.env
#
# porque o .env contém valores com caracteres especiais.
# O Django carrega o arquivo usando python-dotenv.
#
# DJANGO_ENV é definido explicitamente para selecionar prod.py.
django() {

    cd "$BACKEND_DIR"

    env -i \
        HOME="$HOME" \
        USER="$(id -un)" \
        LANG="${LANG:-C.UTF-8}" \
        PATH="${VENV_DIR}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
        DJANGO_ENV="production" \
        "$PYTHON" manage.py "$@"
}

python_dependencies_installed() {

    "$PYTHON" - <<'PY' >/dev/null 2>&1
from importlib.metadata import version

for package in (
    "channels",
    "channels-redis",
    "cryptography",
    "daphne",
    "django-picklefield",
    "django-q2",
    "redis",
):
    version(package)
PY
}

ensure_redis() {

    if command -v redis-server >/dev/null 2>&1 \
        && command -v redis-cli >/dev/null 2>&1; then

        echo "Redis Server: já instalado."

    else

        [[ -n "$APT_GET" ]] || \
            erro "Redis Server ausente e apt-get não encontrado."

        echo "Redis Server ausente. Instalando redis-server e redis-tools..."

        if ! sudo -n "$APT_GET" update; then
            erro "Não foi possível atualizar os pacotes para instalar o Redis Server."
        fi

        if ! sudo -n "$APT_GET" install -y redis-server redis-tools; then
            erro "Não foi possível instalar o Redis Server."
        fi

        command -v redis-server >/dev/null 2>&1 || \
            erro "redis-server não foi instalado corretamente."

        command -v redis-cli >/dev/null 2>&1 || \
            erro "redis-cli não foi instalado corretamente."

    fi

    "$SYSTEMCTL" cat "$REDIS_SERVICE" >/dev/null 2>&1 || \
        erro "Serviço $REDIS_SERVICE não encontrado."

    if ! "$SYSTEMCTL" is-enabled --quiet "$REDIS_SERVICE" >/dev/null 2>&1 \
        || ! "$SYSTEMCTL" is-active --quiet "$REDIS_SERVICE" >/dev/null 2>&1; then

        sudo -n "$SYSTEMCTL" enable --now "$REDIS_SERVICE" || \
            erro "Não foi possível habilitar e iniciar $REDIS_SERVICE."

    fi

    for attempt in {1..5}; do

        REDIS_PING="$(redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null || true)"

        if [[ "$REDIS_PING" == "PONG" ]]; then
            break
        fi

        sleep 1

    done

    [[ "$REDIS_PING" == "PONG" ]] || \
        erro "Redis Server não respondeu PONG em 127.0.0.1:6379."

    echo "Redis Server: OK"
}


# ============================================================
# Log
# ============================================================

mkdir -p "$LOG_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1


# ============================================================
# Lock
# Impede duas atualizações simultâneas
# ============================================================

exec 9>"$LOCK_FILE"

if ! "$FLOCK" -n 9; then
    erro "Já existe uma atualização em execução."
fi


# ============================================================
# Tratamento de erro
# ============================================================

trap '
    STATUS=$?

    echo
    echo "=================================================================="
    echo "ATUALIZAÇÃO INTERROMPIDA"
    echo "Etapa com erro. Código de saída: $STATUS"
    echo "Log: '"$LOG_FILE"'"
    echo "=================================================================="

    exit $STATUS
' ERR


# ============================================================
# 1. Validações
# ============================================================

log "1/12 - Validando ambiente"

if [[ "$(id -un)" != "deploy" ]]; then
    erro "Este atualizador deve ser executado pelo usuário deploy."
fi

[[ -d "$PROJECT_DIR/.git" ]] || \
    erro "Repositório Git não encontrado em $PROJECT_DIR"

[[ -d "$BACKEND_DIR" ]] || \
    erro "Diretório backend não encontrado."

[[ -d "$FRONTEND_DIR" ]] || \
    erro "Diretório frontend não encontrado."

[[ -x "$PYTHON" ]] || \
    erro "Virtualenv Python não encontrado em $VENV_DIR"

[[ -f "$BACKEND_DIR/.env" ]] || \
    erro "Arquivo backend/.env não encontrado."

[[ -f "$BACKEND_DIR/requirements.txt" ]] || \
    erro "requirements.txt não encontrado."

[[ -f "$FRONTEND_DIR/package.json" ]] || \
    erro "frontend/package.json não encontrado."

[[ -f "$FRONTEND_DIR/package-lock.json" ]] || \
    erro "frontend/package-lock.json não encontrado."

[[ -n "$GIT" ]] || erro "git não encontrado."
[[ -n "$NPM" ]] || erro "npm não encontrado."
[[ -n "$CURL" ]] || erro "curl não encontrado."
[[ -n "$FLOCK" ]] || erro "flock não encontrado."

echo "Projeto.....: $PROJECT_DIR"
echo "Backend.....: $BACKEND_DIR"
echo "Frontend....: $FRONTEND_DIR"
echo "Branch......: $BRANCH"
echo "Django......: $DJANGO_SERVICE"
echo "Next.js.....: $NEXT_SERVICE"
echo "Domínio.....: $DOMAIN"


# ============================================================
# 2. Validar serviços
# ============================================================

log "2/12 - Validando serviços da aplicação"

if ! "$SYSTEMCTL" list-unit-files "$DJANGO_SERVICE" \
    --no-legend 2>/dev/null | grep -q "$DJANGO_SERVICE"; then

    erro "Serviço $DJANGO_SERVICE não encontrado."
fi

if ! "$SYSTEMCTL" list-unit-files "$NEXT_SERVICE" \
    --no-legend 2>/dev/null | grep -q "$NEXT_SERVICE"; then

    erro "Serviço $NEXT_SERVICE não encontrado."
fi

echo "$DJANGO_SERVICE encontrado."
echo "$NEXT_SERVICE encontrado."


# ============================================================
# 3. Validar Git
# ============================================================

log "3/12 - Validando repositório"

cd "$PROJECT_DIR"

CURRENT_BRANCH="$("$GIT" branch --show-current)"

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    erro "Branch atual '$CURRENT_BRANCH'. Esperado '$BRANCH'."
fi

# Não sobrescrever alterações locais em arquivos versionados.
#
# Arquivos não versionados são ignorados propositalmente.
if [[ -n "$("$GIT" status --porcelain --untracked-files=no)" ]]; then

    echo
    "$GIT" status --short
    echo

    erro "Existem alterações locais em arquivos versionados. Faça commit ou stash antes de atualizar."
fi

OLD_COMMIT="$("$GIT" rev-parse HEAD)"

echo "Commit atual: $OLD_COMMIT"


# ============================================================
# 4. Buscar atualização
# ============================================================

log "4/12 - Buscando atualizações"

"$GIT" fetch --prune origin "$BRANCH"

LOCAL_COMMIT="$("$GIT" rev-parse HEAD)"
REMOTE_COMMIT="$("$GIT" rev-parse "origin/$BRANCH")"
BASE_COMMIT="$("$GIT" merge-base HEAD "origin/$BRANCH")"

echo "Local : $LOCAL_COMMIT"
echo "Remoto: $REMOTE_COMMIT"

if [[ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ]]; then

    echo
    echo "O código já está atualizado."

elif [[ "$LOCAL_COMMIT" == "$BASE_COMMIT" ]]; then

    echo
    echo "Nova versão encontrada."
    echo

    "$GIT" merge --ff-only "origin/$BRANCH"

elif [[ "$REMOTE_COMMIT" == "$BASE_COMMIT" ]]; then

    erro "O servidor possui commits que ainda não estão no GitHub."

else

    erro "A branch local divergiu de origin/$BRANCH."

fi

NEW_COMMIT="$("$GIT" rev-parse HEAD)"

echo
echo "Commit anterior: $OLD_COMMIT"
echo "Commit atual...: $NEW_COMMIT"


# ============================================================
# 5. Backend - dependências
# ============================================================

log "5/12 - Verificando e instalando dependências"

if python_dependencies_installed; then

    echo "Dependências Python de notificações encontradas. Sincronizando com requirements.txt..."

else

    echo "Dependências Python de notificações ausentes. Instalando requirements.txt..."

fi

"$PYTHON" -m pip install \
    --disable-pip-version-check \
    -r "$BACKEND_DIR/requirements.txt"

if ! python_dependencies_installed; then
    erro "Dependências Python de notificações não foram instaladas corretamente."
fi

"$PYTHON" -m pip check

if ! "$PYTHON" -c "import gunicorn" >/dev/null 2>&1; then
    erro "Gunicorn não está instalado no virtualenv."
fi

ensure_redis


# ============================================================
# 6. Django - verificações
# ============================================================

log "6/12 - Validando Django"

django check --deploy

echo
echo "Verificando migrations ausentes..."

django makemigrations \
    --check \
    --dry-run


# ============================================================
# 7. Frontend - dependências
# ============================================================

log "7/12 - Instalando dependências do frontend"

cd "$FRONTEND_DIR"

"$NPM" ci \
    --no-audit \
    --no-fund


# ============================================================
# 8. Build Next.js
# ============================================================

log "8/12 - Gerando build do Next.js"

cd "$FRONTEND_DIR"

"$NPM" run build


# ============================================================
# 9. Django - banco e estáticos
# ============================================================

log "9/12 - Aplicando migrations"

django migrate --noinput

log "Coletando arquivos estáticos"

django collectstatic --noinput


# ============================================================
# 10. Reiniciar SOMENTE esta aplicação
# ============================================================

log "10/12 - Reiniciando serviços"

echo "Reiniciando: $DJANGO_SERVICE"

sudo -n "$SYSTEMCTL" restart "$DJANGO_SERVICE"

echo "Reiniciando: $NEXT_SERVICE"

sudo -n "$SYSTEMCTL" restart "$NEXT_SERVICE"


# ============================================================
# 11. Validar serviços
# ============================================================

log "11/12 - Validando processos"

sleep 3

if ! "$SYSTEMCTL" is-active --quiet "$DJANGO_SERVICE"; then

    "$SYSTEMCTL" status "$DJANGO_SERVICE" \
        --no-pager \
        -l || true

    erro "$DJANGO_SERVICE não iniciou."
fi

echo "$DJANGO_SERVICE: OK"

if ! "$SYSTEMCTL" is-active --quiet "$NEXT_SERVICE"; then

    "$SYSTEMCTL" status "$NEXT_SERVICE" \
        --no-pager \
        -l || true

    erro "$NEXT_SERVICE não iniciou."
fi

echo "$NEXT_SERVICE: OK"


# ============================================================
# 12. Health checks
# ============================================================

log "12/12 - Executando health checks"


# ------------------------------------------------------------
# Next.js local
# ------------------------------------------------------------

NEXT_CODE="$(
    "$CURL" \
        --silent \
        --output /dev/null \
        --write-out '%{http_code}' \
        --max-time 10 \
        http://127.0.0.1:3001/ \
        || true
)"

if [[ "$NEXT_CODE" != "200" ]]; then
    erro "Next.js local retornou HTTP $NEXT_CODE."
fi

echo "Next.js local: HTTP $NEXT_CODE"


# ------------------------------------------------------------
# Django local
# ------------------------------------------------------------

DJANGO_CODE="$(
    "$CURL" \
        --silent \
        --output /dev/null \
        --write-out '%{http_code}' \
        --max-time 10 \
        -H "Host: conectadoemconcursos.com" \
        -H "X-Forwarded-Proto: https" \
        http://127.0.0.1:8001/admin/ \
        || true
)"

case "$DJANGO_CODE" in

    200|301|302)
        echo "Django local: HTTP $DJANGO_CODE"
        ;;

    *)
        erro "Django local retornou HTTP $DJANGO_CODE."
        ;;

esac


# ------------------------------------------------------------
# HTTPS público
# ------------------------------------------------------------

PUBLIC_OK=0

for attempt in {1..10}; do

    PUBLIC_CODE="$(
        "$CURL" \
            --silent \
            --show-error \
            --output /dev/null \
            --write-out '%{http_code}' \
            --max-time 15 \
            "$DOMAIN/" \
            || true
    )"

    if [[ "$PUBLIC_CODE" == "200" ]]; then

        PUBLIC_OK=1
        break

    fi

    echo "Tentativa $attempt/10: HTTP ${PUBLIC_CODE:-sem resposta}"

    sleep 2

done

if [[ "$PUBLIC_OK" != "1" ]]; then
    erro "O domínio público não respondeu HTTP 200."
fi

echo "HTTPS público: HTTP $PUBLIC_CODE"


# ============================================================
# Final
# ============================================================

echo
echo "=================================================================="
echo " ATUALIZAÇÃO CONCLUÍDA COM SUCESSO"
echo "=================================================================="
echo
echo "Projeto.......: $APP_NAME"
echo "Commit anterior: $OLD_COMMIT"
echo "Commit atual...: $NEW_COMMIT"
echo
echo "Django.........: OK"
echo "Next.js........: OK"
echo "Redis..........: OK"
echo "HTTPS..........: OK"
echo
echo "Log:"
echo "$LOG_FILE"
echo
echo "$DOMAIN"
echo
