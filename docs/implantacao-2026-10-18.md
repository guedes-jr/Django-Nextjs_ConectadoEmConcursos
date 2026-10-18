# Implantação de produção — 18/10/2026

Ambiente autorizado: https://conectadoemconcursos.com. Implantação por SSH com chave,
sem exposição de segredos, envio de e-mail, cobrança, importação ou sincronização.
Não houve commit/push nem execução da CI remota: a release foi empacotada do estado
local revisado, com manifesto de SHA-256 dos 600 arquivos de fonte.

## Release ativa

- Release: `20261018T140012Z-2246285f2247-p1`.
- Build Next: `ca161d96-f4d8-41f4-b30c-f9bcbba53d70`.
- Ponteiro ativo: `/srv/conectado/current`.
- Caminho habitual `/var/www/conectado-em-concursos` aponta para esse ponteiro.
- Instalação anterior preservada em
  `/var/www/conectado-em-concursos-legacy-20261018T140012Z`.
- Configuração privada compartilhada em `/srv/conectado/config/`, com arquivos 0600
  e diretório 0700; os dotenv da release são links para esse diretório.

O Node 24.22.0 foi instalado exclusivamente em `/opt/conectado/`, após comparar o
SHA-256 com o publicado por nodejs.org. O Node global permaneceu 22.23.2; os arquivos
do nginx do outro site não foram alterados. Cada release tem seu próprio virtualenv.

## Banco e persistência

A aplicação anterior usava SQLite, embora houvesse configuração PostgreSQL no dotenv.
O banco foi preservado como SQLite, com `DB_ENGINE=django.db.backends.sqlite3`
explícito e `DB_SQLITE_PATH=/srv/conectado/database/db.sqlite3`. Isso evita conectar
acidentalmente a um PostgreSQL vazio ao iniciar a nova versão ou executar manutenção.
Não houve conversão de motor nem exclusão do banco anterior.

Mídia, backups e acervo privado usam `/srv/conectado/media`,
`/srv/conectado/backups` e `/srv/conectado/private/official-exams`.
A cópia SQLite inicial foi ensaiada com as migrações em staging. Sob manutenção,
com os escritores parados, criou-se o snapshot final consistente de banco/mídia,
aplicaram-se as migrações na cópia persistente e confirmou-se sua integridade.
O banco antigo continuou preservado.

Snapshots de recuperação estão em `/srv/conectado/rollback/`, com acesso privado,
incluindo configurações anteriores e metadados. O backup normalizado
`backup-20261018-111442-463468-ce2f03e8.tar.gz` foi criado pelo comando da aplicação.
A restauração desse arquivo em banco/mídia isolados passou, com integridade SQLite e
conferência das contagens de usuários/questões sem publicar seus valores. A promoção
do patch também teve snapshot prévio; o patch não mudou o esquema.

Os backups estão no mesmo host. Cópia externa, recuperação em outro host e PITR
continuam pendentes; esses snapshots locais não são proteção contra perda do servidor.

## Serviços e verificações

Django passou a executar por Daphne (HTTP/WebSocket), Next por Node 24, e o worker
Django Q está ativo. Os timers de publicação por minuto e backup diário estão
habilitados/ativos. Os serviços de backup e publicação também foram executados
e encerraram com status 0/`success` (últimas verificações às 11:27, UTC−3).
Não havia funções Django Q agendadas nem tarefas pendentes ao
iniciar o worker. Tarefas controladas de prontidão foram enfileiradas e concluídas
para comprovar consumo, sem envio de mensagens nem importação/sincronização.

- nginx e systemd passaram nos validadores nativos do servidor.
- Migrações estão atuais e `/api/ready/` público retorna 200.
- APIs de conversas, biblioteca e relatórios rejeitaram acesso anônimo com 403.
- `/materials`, `/admin` e `/admin/usuarios` redirecionaram para o login público;
  corrigiu-se o uso do hostname interno nos redirects e incluiu-se a biblioteca
  no matcher do proxy.
- `/sw.js` retorna o ID do build ativo e `no-store`; manifesto e offline retornam 200.
- `/private/` e `/backups/` retornam 403.
- Handshake WebSocket anônimo foi rejeitado com 403, pela rota encaminhada ao ASGI.
- Manutenção removida após os checks; processos e timers ativos.

Foi feita uma geração real no OpenRouter com uma questão aprovada e a chave
configurada pelo operador. Retornou texto e citação da questão, usando
`poolside/laguna-s-2.1:free`, com 1342 tokens de entrada e 142 de saída. Não foram
exibidos chave, enunciado nem resposta. Configuração ativa: `AI_PROVIDER=openrouter`,
`OPENROUTER_MODEL=openrouter/free`, `OPENROUTER_ALLOW_PAID=false`. A escolha concreta
pode variar pelo roteador. As permissões comerciais de cada plano permanecem válidas.

O login público também foi renderizado no Chromium, com os campos/botão visíveis,
redirecionamento da biblioteca conferido e nenhum erro JavaScript não tratado.

Validação local: 20 testes focados de operação e 8 E2E passaram; tipos, lint, checks
Django/migrações e sintaxe Bash passaram. O lint mantém quatro avisos anteriores.

## Próximas operações

- SMTP continua em console e Stripe está sem configuração real. Não foi declarada
  entrega transacional nem homologação de pagamentos.
- PostgreSQL permanece pendente; sua adoção exige migração de dados planejada.
- Faltam cópia externa dos backups, coletor/alertas externos, proteção da branch/CI
  remota e homologação em aparelhos reais.
- Iniciar/registrar a observação de 48 horas. As verificações imediatas não comprovam
  esse período. O expurgo de auditoria não foi habilitado automaticamente.
- Concluir teste autenticado de modal/isolamento em produção com uma conta controlada;
  os testes automatizados desse fluxo usam banco temporário.

Para comandos de manutenção, usar o caminho ativo e `DJANGO_ENV=production`; o dotenv
compartilhado já aponta ao banco persistente. Nunca operar diretamente no checkout
legacy para alterar dados da aplicação ativa.

A implantação atual usa artefatos com manifesto, não um checkout Git na pasta ativa.
`make deploy-plan` continua seguro. O modo `update.sh --apply` exige checkout Git
provisionado e não deve ser usado nessa árvore de artefatos. Próximas atualizações
precisam preparar nova pasta, validar fontes/build/ambiente, criar snapshot em
manutenção, trocar o ponteiro e verificar prontidão/PWA; a etapa de banco só ocorre
quando necessária. Não fazer build sobre `.next` em execução nem editar a release ativa.
Não restaurar o banco antigo sobre novas escritas: preservar os dados e preferir
correção progressiva. Ver também [operação de deploy](operacao-deploy.md).
