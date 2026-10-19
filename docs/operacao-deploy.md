# Deploy e operação — etapa 11

Preparação local para um único servidor Linux com systemd, nginx, PostgreSQL e
Redis. Os exemplos usam o domínio e os caminhos já presentes no atualizador:
`conectadoemconcursos.com`, `/var/www/conectado-em-concursos`, Django em 8001 e Next
em 3001. São modelos revisáveis. A implantação real posterior à preparação local está
registrada em [implantação de 18/10/2026](implantacao-2026-10-18.md), incluindo a
adoção de artefatos, os caminhos efetivos e os aceites ainda pendentes. Não houve
push, cobrança, importação ou sincronização.

## Provisionamento antes da primeira atualização

1. Confirmar destino, domínio, usuário `deploy`, acesso SSH, janela e cópia externa
   restaurável. Conferir o status da CI no commit escolhido. Em instalações por releases, o atualizador busca o Git em cache separado e prepara uma nova pasta. No modo legado, exige checkout limpo, incluindo arquivos não rastreados; não faz stash/reset/clean.
2. Provisionar Node 24, Python compatível com a CI (3.12), virtualenv, clientes
   PostgreSQL compatíveis, Redis, nginx, certificados TLS, curl, flock e sudo.
   Não há mais instalação automática de pacotes do sistema pelo atualizador.
3. Configurar `backend/.env` sem versioná-lo, com permissão 0600, usando produção,
   segredo forte, hosts/origens HTTPS, PostgreSQL, mídia/backups/acervo privado
   persistentes e SMTP. Para manter SQLite em volume externo, fixar
   `DB_ENGINE=django.db.backends.sqlite3` e `DB_SQLITE_PATH` no serviço; não mudar
   o motor apenas porque há configuração PostgreSQL antiga no dotenv. O código lê dotenv; não executar `source .env`. Manter
   `AI_PROVIDER=openrouter`, chave no backend e `OPENROUTER_ALLOW_PAID=false`.
   Ver `operacao-infraestrutura.md`, `operacao-ia.md` e `operacao-pagamentos.md`.
4. Configurar `frontend/.env.production.local` com `NEXT_PUBLIC_API_BASE_URL` e
   `NEXT_PUBLIC_BACKEND_URL` nas origens HTTPS reais. São valores públicos,
   incorporados no build. Configurar também `APP_PUBLIC_URL` com a origem pública do
   frontend no serviço Next, para que redirects não usem o hostname interno. O novo `npm run check:production-env` carrega as mesmas
   camadas de ambiente do Next e rejeita origens ausentes, HTTP, localhost,
   credenciais, caminhos e parâmetros. Não valida DNS/certificado/conectividade.
5. Provisionar `/srv/conectado` com proprietário `deploy`, grupo `www-data` e modo
   2750: o setgid permite que o nginx leia o marcador `maintenance`. Mídia e acervo
   devem seguir a separação e permissões descritas em `operacao-infraestrutura.md`;
   backups e arquivos privados não podem ter URLs públicas. Provisionar também
   `/home/deploy/logs/conectado-concursos`, sem acesso público. Proteger logs e backups.
6. Revisar/copiar as unidades de `deploy/systemd/` para `/etc/systemd/system/`.
   Conferir usuário/grupo, caminhos, porta e `/usr/bin/node`. O backend usa Daphne
   para HTTP/WebSocket; o worker usa `manage.py qcluster`. Secrets ficam no dotenv,
   não nas unidades. Validar com `systemd-analyze verify`, seguido de `daemon-reload`.
   Ativar somente as unidades revisadas no ambiente escolhido.
7. Adaptar `deploy/nginx/conectado.conf.example`; copiar os snippets de mídia/PWA
   para `/etc/nginx/snippets/conectado/`. Validar com `nginx -t` antes de recarregar.
   `/api/`, `/accounts/` e `/ws/` vão ao Django; `/admin` vai ao Next. O proxy
   sobrescreve headers encaminhados. O marcador externo retorna 503 e Retry-After,
   sem cache, inclusive para webhooks (o provedor deverá reenviá-los). Exigir acesso
   direto às portas apenas em loopback. Não publicar o diretório do repositório.
8. Conceder sudo sem senha somente aos comandos `systemctl start/stop` com as listas
   exatas de unidades declaradas em `scripts/update.sh`. O script verifica essas
   permissões antes da manutenção; não precisa de sudo para nginx, apt ou código.
   O usuário precisa ler o estado das unidades via `systemctl cat/is-active`.

O bootstrap inicial de um banco vazio requer instalar dependências, validar
produção, criar o primeiro esquema e build sob manutenção e conferir o primeiro
backup/restauração. `update.sh --apply` é atualização de uma instalação existente:
seu backup usa o código/esquema anterior e não deve ser usado para contornar um
bootstrap incompleto. O backend e o frontend devem executar com os mesmos caminhos
e ambientes usados no build/checks.

## Atualização em janela de manutenção

No computador local, `make deploy-plan` apenas descreve as etapas. Não acessa o
servidor, Git remoto, banco, Redis ou serviços. No servidor já provisionado, o
operador executa a implantação com `./scripts/update.sh` (ou `--apply`).
**Sem argumentos, executa a atualização.** Para somente consultar, usar
`./scripts/update.sh --plan`; `make deploy-plan` continua sem efeitos.

Na instalação por releases, o script reconhece `/srv/conectado/current`, busca o
`main` em `/srv/conectado/repository.git` e extrai o commit para uma pasta nova.
Cada pasta recebe virtualenv, dependências e build próprios, além de links aos
dotenv privados em `/srv/conectado/config/`. O Node 24 dedicado em `/opt/conectado/`
é usado sem alterar o Node global. Preparação e build acontecem com o site ativo.
Somente depois dos checks entra manutenção, param os escritores, é criado backup,
são aplicadas migrações/estáticos e o ponteiro é trocado atomicamente. A release
anterior é preservada. Falha antes da manutenção mantém o site anterior ativo;
falha depois dela mantém manutenção para recuperação sem sobrescrever dados.

`DEPLOY_ROOT`, `DEPLOY_REPOSITORY_URL` e `DEPLOY_BRANCH` permitem configurar a
origem e o diretório de releases. `PROJECT_DIR` deve apontar ao ponteiro ativo.
`deployment.json` registra commit, release anterior e hash do atualizador sem
incluir segredos. Durante o bootstrap desta correção, se o Git ainda trouxer o
script antigo, ele é substituído pela versão compatível em execução. Enviar a
correção ao Git; após isso, a versão compatível do repositório prevalece.

Depois de uma atualização, iniciar nova sessão ou executar `cd` novamente pelo
caminho `/var/www/conectado-em-concursos/scripts`, pois o diretório corrente de
uma sessão antiga pode continuar dentro da release anterior.

O script valida ferramentas, unidades e Redis local. No modo legado exige branch
limpa e avanço fast-forward; no modo de releases mantém o Git separado da aplicação
ativa. Confirma as permissões sudo, cria exclusivamente o marcador de manutenção
e exige 503 no HTTPS público antes de parar timers, jobs, worker, Django e Next.

Com os escritores parados, cria backup usando o código anterior. No modo legado,
a janela inclui atualização de código, dependências e build; no modo de releases,
essa preparação já ocorreu em pasta isolada. Os dois modos exigem
`check --deploy --fail-level WARNING`, ausência de drift nas migrações, configuração
pública válida, tipos e build. Erros e avisos de deploy bloqueiam a publicação. A única exceção provisionada
neste servidor é `core.W003` para o backend de e-mail em console, uma pendência
anterior já aceita: o marcador privado `config/allow-console-email` habilita essa
exceção, que aparece explicitamente no log. Não é aplicado a outros backends nem
a outros avisos. Remover o marcador ao homologar SMTP; ele não configura transporte
nem envia e-mails. Aplica migrações, confirma ausência de pendências e coleta
estáticos. Não executa importação, sincronização nem retenção.

Inicia Django, Next e worker; exige serviços ativos, `/api/ready/` local e Next 200.
Só então remove manutenção e verifica HTTPS, prontidão pública, admin redirecionando
para o login na mesma origem, manifesto e worker PWA com o ID do build atual. Por
fim, inicia e confere os timers. O log detalhado vai para o diretório configurado;
marcos de execução também aparecem no terminal. Um lock impede duas atualizações
no mesmo servidor; ele não coordena múltiplos hosts.

Valores de operação podem ser ajustados por `PROJECT_DIR`, `DEPLOY_BRANCH`,
`DEPLOY_DOMAIN`, `DJANGO_PORT`, `NEXT_PORT`, `MAINTENANCE_FILE`, `DEPLOY_LOG_DIR` e
`DEPLOY_LOCK_FILE`. Reaplicar os mesmos caminhos/portas nas unidades e nginx.
O Redis local padrão em 6379 é requisito deste runbook; instalações com Redis remoto,
credenciais ou vários hosts precisam adaptar preflight/unidades e coordenação antes
de usar o atualizador. A configuração Django mantém seus próprios endereços Redis.

## Prontidão, timers e observação

`/api/health/` continua sendo liveness. `/api/ready/` executa SELECT 1 no banco e
PING nos Redis de Channels/fila quando configurados. Não consulta SMTP, Stripe ou
OpenRouter, não envia mensagens e não modifica dados. Retorna somente `ready`/200
ou `unavailable`/503 e `Cache-Control: no-store`, sem erros internos ou credenciais.
Não substitui `migrate --check`, nem comprova consumo pelo worker ou entrega real.

O timer de publicação executa avisos e notícias agendados a cada minuto, sem buscar
fontes externas. O timer de backup cria cópia local diária às 03:15 do fuso do host,
com pequeno atraso aleatório; não faz snapshot do acervo privado nem cópia externa.
A retenção de auditoria continua exigindo sua homologação e confirmação explícita
conforme `operacao-auditoria.md`; não foi habilitado expurgo automático. Desativar
crons/agendadores antigos que dupliquem esses jobs. Processos externos ao conjunto
systemd devem ser parados separadamente antes da janela.

Nas 48 horas após implantação, registrar commit/build, migrações, saída de prontidão,
estado do worker/timers, execução de publicação e backup, métricas de erro, login e
acesso por papéis, envio transacional recebido, webhook Stripe em teste e resposta
OpenRouter com referências reais. Fazer upload e confirmar persistência após troca
de release. Inspecionar WebSocket real e instalar/atualizar PWA em iOS/Android reais.
Configurar alertas externos para 5xx, prontidão, worker e falhas/ausência de backups.
Não anexar logs brutos com segredos à documentação.

## Recuperação de falha

Uma falha após entrar em manutenção mantém/recria o marcador e tenta parar timers,
jobs e serviços. Não inicia uma versão parcial nem restaura automaticamente código,
banco ou mídia. Se systemctl falhar, conferir manualmente quais escritores pararam.
SIGINT/SIGTERM entram na mesma limpeza; SIGKILL/queda do host requer revisão manual.
O reinício do host pode iniciar unidades habilitadas: o marcador continua bloqueando
o tráfego, mas o operador precisa controlar workers/timers antes da recuperação.

Preservar o log, SHAs e o backup anterior; confirmar se a migração começou/concluiu.
Se o esquema não mudou, recuperar uma versão de código/dependências/build compatível
em manutenção. Se mudou, preferir correção progressiva. Para restaurar, validar o par
banco/mídia em ambiente isolado e seguir `operacao-infraestrutura.md`, com escritores
parados, snapshot separado do acervo privado e avaliação das escritas ocorridas após
reabertura. Não executar reset Git nem restore de banco indiscriminadamente.

Iniciar serviços com o código/esquema compatíveis, verificar prontidão local, remover
o marcador somente após essas verificações e repetir checks públicos antes de
reativar os timers. Registrar o incidente e repetir a janela de observação.

## Evidências e limites

Testes locais usam SQLite temporário e processos simulados para provar sequência,
bloqueio por árvore suja, backup antes de checkout/migração, interrupção de falhas e
reativação da manutenção quando o admin aponta para outra origem ou o worker PWA é
antigo. O teste de ambiente público usa Node/Next com arquivos sintéticos em pasta
temporária. Na preparação local não houve instalação de dependências nem build; a implantação
posterior fez ambos em pastas isoladas no servidor.

nginx/systemd não estão disponíveis neste computador. Seus validadores nativos
passaram no servidor na implantação registrada. SQLite/Redis, backup/restauração
isolada, TLS, prontidão e uma geração OpenRouter foram verificados. SMTP, Stripe,
PostgreSQL, cópia externa, dispositivos e observação de 48 horas continuam pendentes.

Referências: [serviços systemd](https://www.freedesktop.org/software/systemd/man/systemd.service.html),
[WebSocket no nginx](https://nginx.org/en/docs/http/websocket.html).

## Proteção de migrações publicadas por overlay

A release de bancas de 18/10/2026 registra `required_migration_files` em
`deployment.json`. O atualizador exige que esses arquivos existam no código
extraído do Git antes de construir a release ou entrar em manutenção. Enquanto
o commit/push das alterações locais não incluir `questions/0026_exam_banca_catalog.py`
e `concursos/0007_concurso_banca.py` nos respectivos diretórios de migrações,
a atualização será interrompida com mensagem explícita, preservando a aplicação
ativa. Enviar todo o código correspondente junto das migrações.
