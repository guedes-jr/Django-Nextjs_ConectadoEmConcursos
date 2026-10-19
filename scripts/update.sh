#!/usr/bin/env bash
# Atualização por release (ou checkout legado) com janela de manutenção.
# Não executa importações/sync.
RELEASE_DEPLOY_VERSION=1
set -Eeuo pipefail
umask 027
exec 3>&1
UPDATER_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/$(basename -- "${BASH_SOURCE[0]}")"

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
RELEASE_MODE=0
DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/conectado}"
CURRENT_LINK="$DEPLOY_ROOT/current"
REPOSITORY_URL="${DEPLOY_REPOSITORY_URL:-https://github.com/guedes-jr/Django-Nextjs_ConectadoEmConcursos.git}"
REPOSITORY_CACHE="$DEPLOY_ROOT/repository.git"

fail() { echo "ERRO: $*" >&2; if [[ "${LOG_CAPTURED:-0}" == 1 ]]; then echo "ERRO: $*" >&3; fi; exit 1; }
log() {
    local line="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
    printf '%s\n' "$line"
    if [[ "${LOG_CAPTURED:-0}" == 1 ]]; then printf '%s\n' "$line" >&3; fi
}
control() { sudo -n systemctl "$@"; }
require_control() {
    # `sudo -l comando` também aceita regras que exigem senha. Exigir NOPASSWD
    # explicitamente antes de bloquear o tráfego.
    sudo -n -ll systemctl "$@" | grep -Eq 'Options:.*!authenticate' || fail "Sudo sem senha não provisionado para systemctl $*."
}
django() {
    (
        cd "$BACKEND_DIR"
        # Não interpretar .env como shell nem propagar configurações de desenvolvimento.
        if [[ "${1:-}" == check && -f "$DEPLOY_ROOT/config/allow-console-email" ]]; then
            env -i HOME="$HOME" LANG="${LANG:-C.UTF-8}" \
                PATH="$BACKEND_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
                DJANGO_ENV=production DJANGO_SETTINGS_MODULE=config.settings "$PYTHON" -c '
import sys, django
django.setup()
from django.conf import settings
from django.core.management import call_command
if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
    print("AVISO ACEITO core.W003: e-mail em console já autorizado neste ambiente; entrega SMTP continua pendente.")
    settings.SILENCED_SYSTEM_CHECKS = [*settings.SILENCED_SYSTEM_CHECKS, "core.W003"]
call_command("check", *sys.argv[1:])
' "${@:2}"
        else
            env -i HOME="$HOME" LANG="${LANG:-C.UTF-8}" \
                PATH="$BACKEND_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
                DJANGO_ENV=production "$PYTHON" manage.py "$@"
        fi
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
# Build fora da release ativa. Até a manutenção, nenhuma troca de ponteiro ou migração.
prepare_release() {
    [[ -d "$DEPLOY_ROOT/releases" && -w "$DEPLOY_ROOT/releases" && -w "$DEPLOY_ROOT" ]] || fail "Diretórios de releases sem permissão."
    [[ -f "$DEPLOY_ROOT/config/backend.env" && -f "$DEPLOY_ROOT/config/frontend.env" ]] || fail "Configuração compartilhada ausente."
    git check-ref-format "refs/heads/$BRANCH" >/dev/null || fail "Branch inválida."
    if [[ ! -d "$REPOSITORY_CACHE" ]]; then git init --bare "$REPOSITORY_CACHE"; fi
    GIT_TERMINAL_PROMPT=0 git --git-dir="$REPOSITORY_CACHE" fetch --depth=1 "$REPOSITORY_URL" "+refs/heads/$BRANCH:refs/heads/$BRANCH"
    NEW_COMMIT="$(git --git-dir="$REPOSITORY_CACHE" rev-parse "refs/heads/$BRANCH^{commit}")"
    NEW_RELEASE="$DEPLOY_ROOT/releases/$(date -u '+%Y%m%dT%H%M%SZ')-${NEW_COMMIT:0:12}"
    mkdir "$NEW_RELEASE"
    log "Preparando release $NEW_RELEASE a partir de $NEW_COMMIT; tráfego permanece aberto."
    git --git-dir="$REPOSITORY_CACHE" archive "$NEW_COMMIT" | tar -x -C "$NEW_RELEASE"
    # Uma release publicada por overlay pode conter migrações ainda não enviadas
    # ao Git. Não publicar código que desconheça essas alterações do esquema.
    "$PYTHON" -c '
import json,pathlib,sys
active=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2])
manifest=active/"deployment.json"
required=json.loads(manifest.read_text()).get("required_migration_files",[]) if manifest.exists() else []
for name in required:
 path=pathlib.Path(name)
 if path.is_absolute() or ".." in path.parts or not (target/path).is_file():
    raise SystemExit("ERRO: o Git ainda não contém as migrações da release ativa. Envie código e migrações antes de atualizar: " + name)
' "$CURRENT_LINK" "$NEW_RELEASE"
    # Bootstrap da correção: não reintroduzir o atualizador antigo ainda presente
    # no main. Quando a versão compatível for enviada ao Git, prevalece a do Git.
    if ! grep -q '^RELEASE_DEPLOY_VERSION=' "$NEW_RELEASE/scripts/update.sh"; then
        install -m 0750 "$UPDATER_PATH" "$NEW_RELEASE/scripts/update.sh"
        log "Atualizador compatível aplicado como patch de bootstrap; enviar esta correção ao Git."
    fi
    ln -s "$DEPLOY_ROOT/config/backend.env" "$NEW_RELEASE/backend/.env"
    ln -s "$DEPLOY_ROOT/config/frontend.env" "$NEW_RELEASE/frontend/.env.production.local"
    "$PYTHON" -m venv "$NEW_RELEASE/backend/.venv"
    "$NEW_RELEASE/backend/.venv/bin/python" -m pip install --disable-pip-version-check -r "$NEW_RELEASE/backend/requirements.txt"
    "$NEW_RELEASE/backend/.venv/bin/python" -m pip check
    # Validar usando o mesmo dotenv da execução, sem imprimir seu conteúdo.
    (
        BACKEND_DIR="$NEW_RELEASE/backend"
        PYTHON="$BACKEND_DIR/.venv/bin/python"
        django check --deploy --fail-level WARNING
        django makemigrations --check --dry-run
    )
    (
        cd "$NEW_RELEASE/frontend"
        npm ci --include=dev --no-audit --no-fund
        NODE_ENV=production npm run check:production-env
        npm run typecheck
        E2E_RUN=0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 npm run build
        [[ -s .next/BUILD_ID ]] || fail "Build sem identificador."
    )
    # Manifesto sem segredos; identifica também o patch de bootstrap.
    "$PYTHON" -c '
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
(root / "deployment.json").write_text(json.dumps({"commit": sys.argv[2], "previous_release": sys.argv[3], "updater_sha256": hashlib.sha256((root / "scripts/update.sh").read_bytes()).hexdigest()}, indent=2) + "\n")
' "$NEW_RELEASE" "$NEW_COMMIT" "$(readlink -f "$CURRENT_LINK")"
}

main() {
    case "${1:---apply}" in
        --plan)
            cat <<'PLAN'
Plano de atualização (nenhum comando operacional foi executado):
1. Validar usuário, ferramentas, serviços e a instalação.
2. Buscar main; em instalação por releases, preparar dependências/build fora da pasta ativa.
3. Ativar manutenção no proxy e confirmar HTTP 503 público.
4. Parar timers, jobs, worker, backend e frontend; criar backup com o código anterior.
5. Usar a nova release validada (ou atualizar o checkout legado por fast-forward).
6. Aplicar migrações e coletar estáticos com os escritores parados.
7. Ativar o ponteiro da release, iniciar aplicação/worker e verificar prontidão local.
8. Remover manutenção, verificar HTTPS/admin/PWA e iniciar timers.
Falhas após a entrada em manutenção mantêm o tráfego bloqueado e os serviços parados.
Sem argumentos executa a atualização. Use --plan apenas para consultar.
PLAN
            return ;;
        --apply) [[ "$#" -le 1 ]] || fail "Use somente --plan ou --apply." ;;
        *) fail "Use --plan (somente consulta) ou --apply (padrão)." ;;
    esac
    [[ "$(id -un)" == deploy ]] || fail "Execute como deploy."
    [[ "$DOMAIN" =~ ^https://[a-zA-Z0-9.-]+$ ]] || fail "DEPLOY_DOMAIN deve ser uma origem HTTPS sem caminho/porta."
    [[ "$DJANGO_PORT" =~ ^[0-9]+$ && "$NEXT_PORT" =~ ^[0-9]+$ ]] || fail "Portas inválidas."
    [[ "$PROJECT_DIR" == /* && "$MAINTENANCE_FILE" == /* && "$LOCK_FILE" == /* ]] || fail "Use caminhos absolutos."
    [[ ! -e "$MAINTENANCE_FILE" ]] || fail "Já existe uma manutenção; revisar antes de atualizar."
    if [[ -L "$CURRENT_LINK" && "$(readlink -f "$PROJECT_DIR")" == "$(readlink -f "$CURRENT_LINK")" ]]; then RELEASE_MODE=1; fi
    [[ "$RELEASE_MODE" == 1 || -d "$PROJECT_DIR/.git" ]] || fail "Instalação sem checkout Git ou ponteiro de release reconhecido."
    [[ -x "$PYTHON" && -f "$BACKEND_DIR/.env" ]] || fail "Virtualenv ou backend/.env ausente."
    # Node dedicado da instalação; não trocar o Node global usado por outros sites.
    if [[ -d /opt/conectado/node-v24.22.0-linux-x64/bin ]]; then
        export PATH="/opt/conectado/node-v24.22.0-linux-x64/bin:$PATH"
    fi
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
    if [[ "$RELEASE_MODE" == 0 ]]; then
        [[ "$(git branch --show-current)" == "$BRANCH" ]] || fail "Branch inesperada."
        [[ -z "$(git status --porcelain)" ]] || fail "Há arquivos locais alterados/não rastreados; não serão sobrescritos."
    fi
    for unit in "${SERVICES[@]}" "${TIMERS[@]}" "${JOBS[@]}"; do
        systemctl cat "$unit" >/dev/null || fail "Unidade não provisionada: $unit."
    done
    systemctl is-active --quiet redis-server.service || fail "Redis não está ativo."
    [[ "$(redis-cli -h 127.0.0.1 -p 6379 ping)" == PONG ]] || fail "Redis local indisponível."
    if [[ "$RELEASE_MODE" == 1 ]]; then
        OLD_COMMIT="$(readlink -f "$CURRENT_LINK")"
        prepare_release
    else
        OLD_COMMIT="$(git rev-parse HEAD)"
        git fetch --prune origin "$BRANCH"
        NEW_COMMIT="$(git rev-parse "origin/$BRANCH")"
        git merge-base --is-ancestor "$OLD_COMMIT" "$NEW_COMMIT" || fail "Atualização não é fast-forward."
    fi
    log "Release anterior $OLD_COMMIT; destino $NEW_COMMIT"
    # Verifica as permissões sudo exatas antes de bloquear o tráfego.
    require_control stop "${TIMERS[@]}"
    require_control stop "${JOBS[@]}" "${SERVICES[@]}"
    require_control start "${SERVICES[@]}"
    require_control start "${TIMERS[@]}"
    (set -o noclobber; : > "$MAINTENANCE_FILE")
    MAINTENANCE_ENTERED=1
    wait_http "$DOMAIN/api/health/" 503
    control stop "${TIMERS[@]}"
    control stop "${JOBS[@]}" "${SERVICES[@]}"
    log "Criando backup antes de alterar código, dependências ou esquema"
    django backup_db
    if [[ "$RELEASE_MODE" == 1 ]]; then
        BACKEND_DIR="$NEW_RELEASE/backend"
        FRONTEND_DIR="$NEW_RELEASE/frontend"
        PYTHON="$BACKEND_DIR/.venv/bin/python"
    else
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
    fi
    django migrate --noinput
    django migrate --check
    django collectstatic --noinput
    if [[ "$RELEASE_MODE" == 1 ]]; then
        ln -s "$NEW_RELEASE" "$DEPLOY_ROOT/current.next"
        "$PYTHON" -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$DEPLOY_ROOT/current.next" "$CURRENT_LINK"
        log "Ponteiro ativo alterado para $NEW_RELEASE; release anterior preservada."
    fi
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
