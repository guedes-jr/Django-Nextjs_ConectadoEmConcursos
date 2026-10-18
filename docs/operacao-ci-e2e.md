# CI, E2E e registro de falhas — etapa 8

## Pipeline

`.github/workflows/ci.yml` executa em push e pull request com permissão somente de
leitura do repositório e cancelamento da execução anterior da mesma referência.

- Backend: Python 3.12, dependências fixadas, `make check` (inclui drift de migrações)
  e toda a suíte Django. Settings `config.settings.ci` ignoram dotenv e usam SQLite,
  e-mail em memória, fila síncrona e canais em memória; integrações pagas ficam vazias.
- Frontend: Node 24, `npm ci`, lint, TypeScript e build obrigatório. Instala Chromium
  compatível com o Playwright fixado no lockfile e executa E2E sobre `next start`.
  Não usa `test --if-present` nem pula verificações por ausência de script.
- E2E tem timeout global, um worker e nenhum retry automático: efeitos no banco de
  uma tentativa não devem mascarar a falha original. Relatórios/traces/screenshots
  são enviados como artifacts somente em falha, com retenção de sete dias.
- Builds E2E usam `.next-e2e`, separado de `.next`, para preservar o desenvolvimento
  local. Esses diretórios e relatórios ficam fora do Git e do lint.

Referências oficiais: [Playwright na CI](https://playwright.dev/docs/ci-intro),
[servidores do Playwright](https://playwright.dev/docs/test-webserver),
[setup-python](https://github.com/actions/setup-python) e
[setup-node](https://github.com/actions/setup-node).

## Execução local

Com dependências backend/frontend já instaladas, a dependência Playwright vem do
`npm ci` do frontend. Na primeira execução, instalar o navegador correspondente:

```sh
cd frontend
npx playwright install chromium
cd ..
make test-e2e
```

Usa frontend em `127.0.0.1:3100`, backend em `127.0.0.1:8100` e não reutiliza
servidores existentes. Liberar essas portas antes do teste. `E2E_PYTHON` permite
informar o executável Python quando não estiver em `backend/.venv/bin/python`.

`frontend/e2e/backend.py` cria um diretório temporário, migra um banco vazio e
insere somente usuários e recibo fictícios. Força os settings isolados, sem acessar
banco operacional, Redis, SMTP, Stripe ou IA. SIGTERM encerra o servidor e limpa o
diretório. Não é comando de importação de conteúdo nem provisionamento de produção.
Não usar `config.settings.ci` para servir a aplicação pública.

Para reproduzir o fluxo de produção da CI:

```sh
E2E_RUN=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8100 NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8100 make build
E2E_PRODUCTION=1 make test-e2e
```

As URLs públicas são incorporadas no build; precisam apontar ao backend de teste
antes de compilar. A fonte Google usada pelo projeto pode exigir rede durante o
build. A execução local pode precisar de autorização para portas/processos de browser.

## Cobertura inicial

Seis cenários com frontend e backend reais, sem interceptar as respostas da API:

1. Área administrativa exige login.
2. Login inválido apresenta mensagem de erro.
3. Aluno contrata plano gratuito; ausência de gateway preserva seu acesso atual.
4. Administrador financeiro consulta o recibo confirmado, altera o período e
   exporta CSV no mesmo intervalo absoluto exibido.
5. Staff sem permissão financeira não recebe dinheiro na página nem no CSV.
6. Aluno recebe 403 na API administrativa e é redirecionado ao tentar a tela.

Exceções não tratadas e acionamento do error boundary falham os cenários funcionais.
Seus service workers ficam bloqueados para evitar interferência de cache. Desde a
etapa 9, projetos PWA separados ativam workers e acrescentam 16 cenários em produção,
conforme [operação de PWA](operacao-pwa.md). O runner é Chromium desktop. OAuth externo, cobrança real,
PostgreSQL, SMTP e outros browsers/dispositivos exigem homologações específicas.

O teste de primeiro acesso encontrou uma falha de renderização quando a API retorna
corpo vazio para usuário sem assinatura. O cliente agora normaliza esse retorno para
null e a tela tolera ausência do plano. O fluxo está coberto pelo cenário de contratação.

## Registro de falhas e correlação

`RequestObservabilityMiddleware` devolve `X-Request-ID`, preservando um UUID válido
ou gerando outro. A auditoria reutiliza esse identificador. Respostas HTTP 5xx geram
JSON no logger `conectado.errors`, enviado a stderr, com evento, UUID, método,
modelo da rota, status e duração. Não inclui payload, corpo de resposta, URL concreta,
query string, credenciais ou identificação de usuário.

`app/error.tsx` e `global-error.tsx` apresentam recuperação por nova tentativa ou
página inicial. O evento de console `ui.render_error` guarda apenas digest sanitizado,
sem mensagem, stack, URL ou armazenamento do browser. Isso é a base local de
observabilidade, não um coletor remoto. Não substitui os demais logs do Django/Next;
revisar separadamente a política de redação, retenção e acesso desses logs.

No deploy, capturar stderr estruturado com o coletor do ambiente, definir retenção
restrita e alertas de 5xx. Telemetria de browser em produção, se necessária, depende
de escolha/configuração de um coletor autorizado e política de dados. Nenhum SDK,
projeto externo, alerta ou destinatário foi provisionado nesta etapa.

## Validação

- 466 testes backend passaram com settings isolados; após ajuste final da correlação,
  oito testes focados de observabilidade/auditoria foram novamente aprovados.
- Os seis E2E passaram tanto no servidor de desenvolvimento quanto no build de
  produção. Build de produção, check/migration-check, tipos e lint aprovados;
  lint mantém quatro avisos preexistentes.
- Validação local com Node 24 e Python 3.11 disponível no workspace; a CI declara
  Python 3.12 e precisa ter sua primeira execução no GitHub conferida após o push.
  Não houve push, alteração de branch protection, deploy ou operação em produção.
