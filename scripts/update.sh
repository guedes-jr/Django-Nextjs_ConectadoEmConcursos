#!/usr/bin/env bash
# Atualização in-place com janela de manutenção. Não executa importações/sync.
set -Eeuo pipefail
umask 027
exec 3>&1

PROJECT_DIR="${PROJECT_DIR:-/var/www/conectado-em-concursos}"
BRANCH="${DEPLOY_BRANCH:-main}"
DOMAIN="${DEPLOY_DOMAIN:-https://conectadoemconcursos.com}"
PUBLIC_HOST="${DOMAIN#https://}"
DJANGO_PORT="${DJANGO_PORT:-8001}"
NEXT_PORT="${NEXT_PORT:-3001}"
MAINTENANCE_FILE="${MAINTENANCE_FILE:-/srv/conectado/maintenance}"
LOG_DIR="${DEPLOY_LOG_DIR:-/home/deploy/logs/conectado-concursos}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/srv/conectado/update.lock}"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PYTHON="$BACKEND_DIR/.venv/bin/python"
SERVICES=(conectado-concursos-django.service conectado-concursos-next.service conectado-concursos-worker.service)
TIMERS=(conectado-concursos-publish.timer conectado-concursos-backup.timer)
JOBS=(conectado-concursos-publish.service conectado-concursos-backup.service)
MAINTENANCE_ENTERED=0
SUCCESS=0

fail() { echo "ERRO: $*" >&2; if [[ "${LOG_CAPTURED:-0}" == 1 ]]; then echo "ERRO: $*" >&3; fi; exit 1; }
log() {
    local line="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
    printf '%s\n' "$line"
    if [[ "${LOG_CAPTURED:-0}" == 1 ]]; then printf '%s\n' "$line" >&3; fi
}
control() { sudo -n systemctl "$@"; }
django() {
    (
        cd "$BACKEND_DIR"
        # Não interpretar .env como shell nem propagar configurações de desenvolvimento.
        env -i HOME="$HOME" LANG="${LANG:-C.UTF-8}" \
            PATH="$BACKEND_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
            DJANGO_ENV=production "$PYTHON" manage.py "$@"
    )
}
cleanup() {
    local result=$?
    trap - EXIT
    if [[ "$MAINTENANCE_ENTERED" == 1 && "$SUCCESS" != 1 ]]; then
        log "Falha: manutenção mantida em $MAINTENANCE_FILE; sem restauração automática de banco/código."
        : > "$MAINTENANCE_FILE"
        control stop "${TIMERS[@]}" || true
        control stop "${JOBS[@]}" "${SERVICES[@]}" || true
        log "Preserve o backup e o log. Siga docs/operacao-deploy.md para recuperação."
    fi
    exit "$result"
}
wait_http() {
    local url="$1" expected="$2" attempt code
    shift 2
    for attempt in {1..12}; do
        code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
            --connect-timeout 2 --max-time 8 "$@" "$url" || true)"
        if [[ "$code" == "$expected" ]]; then return 0; fi
        sleep 2
    done
    fail "A verificação HTTP não atingiu $expected após 12 tentativas."
}
check_admin() {
    local url="$1" headers
    headers="$(curl --silent --show-error --max-time 10 --dump-header - --output /dev/null "$url")"
    # Aceitar apenas login do mesmo domínio com retorno à rota pedida.
    printf '%s\n' "$headers" | "$PYTHON" -c '
import re, sys
from urllib.parse import urljoin, urlsplit, parse_qs
headers = sys.stdin.read().replace("\r", "")
assert re.search(r"^HTTP/[0-9.]+ (302|303|307|308) ", headers, re.M)
location = re.search(r"^location: (.+)$", headers, re.M | re.I).group(1)
origin = urlsplit(sys.argv[1])
target = urlsplit(urljoin(sys.argv[1], location))
assert (target.scheme, target.netloc) == (origin.scheme, origin.netloc)
assert target.path == "/login"
assert parse_qs(target.query).get("next") == [origin.path]
' "$url"

}
main() {
    case "${1:---plan}" in
        --plan)
            cat <<'PLAN'
Plano de atualização (nenhum comando operacional foi executado):
1. Validar usuário, ferramentas, serviços, branch e árvore Git limpa.
2. Buscar main com fast-forward; não alterar a árvore ativa ainda.
3. Ativar manutenção no proxy e confirmar HTTP 503 público.
4. Parar timers, jobs, worker, backend e frontend; criar backup com o código anterior.
5. Atualizar código e dependências; validar Django, tipos e build.
6. Aplicar migrações e coletar estáticos com os escritores parados.
7. Iniciar aplicação/worker e verificar prontidão local.
8. Remover manutenção, verificar HTTPS/admin/PWA e iniciar timers.
Falhas após a entrada em manutenção mantêm o tráfego bloqueado e os serviços parados.
A operação exige scripts/update.sh --apply no servidor provisionado.
PLAN
            return ;;
        --apply) [[ "$#" == 1 ]] || fail "Use somente --plan ou --apply." ;;
        *) fail "Use --plan (padrão, sem efeitos) ou --apply." ;;
    esac
    [[ "$(id -un)" == deploy ]] || fail "Execute como deploy."
    [[ "$DOMAIN" =~ ^https://[a-zA-Z0-9.-]+$ ]] || fail "DEPLOY_DOMAIN deve ser uma origem HTTPS sem caminho/porta."
    [[ "$DJANGO_PORT" =~ ^[0-9]+$ && "$NEXT_PORT" =~ ^[0-9]+$ ]] || fail "Portas inválidas."
    [[ "$PROJECT_DIR" == /* && "$MAINTENANCE_FILE" == /* && "$LOCK_FILE" == /* ]] || fail "Use caminhos absolutos."
    [[ ! -e "$MAINTENANCE_FILE" ]] || fail "Já existe uma manutenção; revisar antes de atualizar."
    [[ -d "$PROJECT_DIR/.git" && -x "$PYTHON" && -f "$BACKEND_DIR/.env" ]] || fail "Repositório, virtualenv ou backend/.env ausente."
    [[ -f "$FRONTEND_DIR/package-lock.json" ]] || fail "Lockfile do frontend ausente."
    for tool in git npm node curl flock sudo systemctl redis-cli; do
        command -v "$tool" >/dev/null || fail "Ferramenta ausente: $tool. Provisionar antes do deploy."
    done
    [[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || fail "Node 24 é obrigatório."
    [[ -w "$(dirname "$MAINTENANCE_FILE")" && -w "$(dirname "$LOCK_FILE")" ]] || fail "Diretórios de operação não provisionados."
    mkdir -p "$LOG_DIR"
    LOG_FILE="$LOG_DIR/update-$(date -u '+%Y%m%d-%H%M%S').log"
    printf 'Log detalhado: %s\n' "$LOG_FILE"
    exec >> "$LOG_FILE" 2>&1
    LOG_CAPTURED=1
    exec 9>"$LOCK_FILE"
    flock -n 9 || fail "Já existe uma atualização em execução."
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    cd "$PROJECT_DIR"
    [[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "Branch inesperada."
    [[ -z "$(git status --porcelain)" ]] || fail "Há arquivos locais alterados/não rastreados; não serão sobrescritos."
    for unit in "${SERVICES[@]}" "${TIMERS[@]}" "${JOBS[@]}"; do
        systemctl cat "$unit" >/dev/null || fail "Unidade não provisionada: $unit."
    done
    systemctl is-active --quiet redis-server.service || fail "Redis não está ativo."
    [[ "$(redis-cli -h 127.0.0.1 -p 6379 ping)" == PONG ]] || fail "Redis local indisponível."
    OLD_COMMIT="$(git rev-parse HEAD)"
    git fetch --prune origin "$BRANCH"
    NEW_COMMIT="$(git rev-parse "origin/$BRANCH")"
    git merge-base --is-ancestor "$OLD_COMMIT" "$NEW_COMMIT" || fail "Atualização não é fast-forward."
    log "Release anterior $OLD_COMMIT; destino $NEW_COMMIT"
    # Verifica as permissões sudo exatas antes de bloquear o tráfego.
    sudo -n -l systemctl stop "${TIMERS[@]}" >/dev/null
    sudo -n -l systemctl stop "${JOBS[@]}" "${SERVICES[@]}" >/dev/null
    sudo -n -l systemctl start "${SERVICES[@]}" >/dev/null
    sudo -n -l systemctl start "${TIMERS[@]}" >/dev/null
    (set -o noclobber; : > "$MAINTENANCE_FILE")
    MAINTENANCE_ENTERED=1
    wait_http "$DOMAIN/api/health/" 503
    control stop "${TIMERS[@]}"
    control stop "${JOBS[@]}" "${SERVICES[@]}"
    log "Criando backup antes de alterar código, dependências ou esquema"
    django backup_db
    git merge --ff-only "$NEW_COMMIT"
    "$PYTHON" -m pip install --disable-pip-version-check -r "$BACKEND_DIR/requirements.txt"
    "$PYTHON" -m pip check
    "$PYTHON" -c 'import daphne'
    django check --deploy --fail-level WARNING
    django makemigrations --check --dry-run
    (
        cd "$FRONTEND_DIR"
        npm ci --include=dev --no-audit --no-fund
        NODE_ENV=production npm run check:production-env
        npm run typecheck
        E2E_RUN=0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 npm run build
        [[ -s .next/BUILD_ID ]] || fail "Build sem identificador."
    )
    django migrate --noinput
    django migrate --check
    django collectstatic --noinput
    control start "${SERVICES[@]}"
    for unit in "${SERVICES[@]}"; do systemctl is-active --quiet "$unit" || fail "Serviço inativo: $unit"; done
    wait_http "http://127.0.0.1:$DJANGO_PORT/api/ready/" 200 -H "Host: $PUBLIC_HOST" -H 'X-Forwarded-Proto: https'
    wait_http "http://127.0.0.1:$NEXT_PORT/" 200
    # Removida somente após os serviços locais passarem. Em falha posterior, recriar.
    rm "$MAINTENANCE_FILE"
    if ! (
        wait_http "$DOMAIN/api/ready/" 200
        wait_http "$DOMAIN/" 200
        check_admin "$DOMAIN/admin" || exit 1
        check_admin "$DOMAIN/admin/usuarios" || exit 1
        curl --fail --silent --show-error --max-time 15 "$DOMAIN/sw.js" | "$PYTHON" -c '
import pathlib, re, sys
expected = pathlib.Path(sys.argv[1]).read_text().strip()
match = re.search(r"const VERSION = \"([^\"\n]+)\";", sys.stdin.read())
assert match and match.group(1) == expected
' "$FRONTEND_DIR/.next/BUILD_ID" || exit 1
        curl --fail --silent --show-error --max-time 15 "$DOMAIN/manifest.webmanifest" | "$PYTHON" -c 'import json,sys; assert json.load(sys.stdin).get("display") == "standalone"'
    ); then
        : > "$MAINTENANCE_FILE"
        fail "Falha de homologação pública; manutenção reativada."
    fi
    control start "${TIMERS[@]}"
    for unit in "${TIMERS[@]}"; do systemctl is-active --quiet "$unit" || fail "Timer inativo: $unit"; done
    SUCCESS=1
    log "Atualização concluída em $NEW_COMMIT. Conferir worker, backups externos e observação por 48 horas."
}
main "$@"
