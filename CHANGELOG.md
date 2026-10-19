# Changelog

Histórico das alterações relevantes do Conectado em Questões, organizado por tipo
segundo Keep a Changelog. Versões publicadas seguem SemVer; esta revisão não cria
uma versão, tag ou publicação.

## [Unreleased]

- Redefinição direta de senha na lista e ficha de usuários, com confirmação, motivo, política de senhas, hierarquia administrativa, revogação de acessos e auditoria sem credenciais.

- Upload de vários PDFs por concurso, com título, tipo e cargo por arquivo; documentos gerais separados dos documentos do cargo. Cadastro auditável de lotes locais, com questões pendentes e preservação de gabaritos gerais e individuais.

- Separados os menus e páginas de Artigos (materiais editoriais) e Notícias (automação), com busca, categorias e leitura restritas à origem de cada área.

Consolidação em 18/10/2026 das atualizações desta sequência de trabalho.
As interfaces administrativas foram publicadas a partir do commit `5e50bd3`, conforme a [atualização de produção](docs/atualizacao-producao-2026-10-18.md).
A correção posterior do atualizador foi aplicada também no servidor como patch
de bootstrap e ainda precisa acompanhar o próximo commit/push, junto dos testes
e da documentação locais. Não foi criada uma tag de versão.

### Added

- Upload privado de PDFs de até 25 MB nos materiais do concurso, com validação, progresso, prévia da equipe, substituição e download autenticado para alunos após publicação. Metadados e auditoria, limpeza após commit e inclusão no backup/restauração com coordenação das escritas.

- Central do concurso com dados, página oficial, apresentação, documentos e provas vinculadas; gestão auditada de materiais por concurso/prova, com links próprios ou do acervo e publicação explícita.
- Apresentação da prova antes do simulado, com disciplinas, quantidade disponível, concurso e materiais; simulado completo em ordem de numeração, seleção automática da prova e retorno à prova pelo histórico.

- Textos de apoio reutilizáveis em `/admin/textos-apoio`, com cadastro formatado, referência, indicadores, busca e vínculos opcionais nas questões. Expansão acima do enunciado na resolução e nos simulados, prévia na revisão e integração ao contexto do tutor; auditoria, proteção de exclusão e de edições concorrentes. Publicado em produção com a migração 0027; [registro dos textos de apoio](docs/textos-apoio.md).

- Catálogo de 53 bancas com 59 grafias alternativas e fontes oficiais, publicado em produção; comando auditado e idempotente com simulação por padrão.
- Vínculos de banca em provas e concursos, seleção pesquisável por nome/sigla, filtros e contagens considerando aliases. A carga preservou as 417 questões e vinculou 13 provas e 5 concursos com evidência suficiente.
- Proteção do atualizador contra código Git sem as migrações exigidas pela release ativa. Detalhes e pendências documentais no [catálogo de bancas](docs/catalogo-bancas.md).

- Componentes compartilhados para gestão administrativa: indicadores globais, filtros, contagem, ordenação, paginação, confirmações e controle de listagens com estado na URL.
- Cadastro de usuários comuns pelo admin, com validação de senha pelo Django e auditoria, sem atribuição automática de staff ou envio de mensagens.
- Indicadores e filtros por acesso, novos cadastros e assinaturas vigentes na gestão de usuários.
- Resumos globais nas listagens de assinaturas, staff, bancas, concursos, provas, artigos, notificações, questões, fontes e acervo oficial.
- Consulta completa da questão e acesso direto à revisão pelo identificador, inclusive para comparação com questões já revisadas.
- Proteção de comentários não salvos na fila: salvar e descartar explícitos, confirmação ao navegar e proteção ao sair da página.
- Pesquisa paginada de documentos compatíveis para associar prova e gabarito, independente da página atual do acervo.
- Testes focados de API e Playwright para os fluxos administrativos consolidados, com dados sintéticos e verificações de layout móvel.
- Referência do [padrão das páginas administrativas](docs/padrao-paginas-admin.md).

### Changed

- Áreas de **Artigos** e **Notícias** separadas no menu do aluno, com leitura interna pelo título e botão, inclusive para artigos sem URL externa. Corpo formatado sanitizado e nova tentativa em falhas de leitura; lista e detalhe respeitam o estado editorial publicado.

- **Planos:** consolidada a página como referência de cabeçalho com ações, indicadores, filtros, lista e paginação; valores monetários em formato brasileiro e abrangência dos indicadores explicitada.
- **Usuários:** padronizados cabeçalho, criação, tabela, busca, filtros, ordenação e paginação; bloqueio exige confirmação e motivo. Edição de papéis permanece na gestão de Staff.
- **Assinaturas:** indicadores e filtros por plano, status, ciclo e vencimento; tabela identifica contratos gerenciados pela Stripe e encaminha atribuição de plano à gestão de usuários. MRR é apresentado como estimativa restrita à permissão financeira.
- **Staff:** filtros por papel e acesso, indicadores, ordenação e paginação; criação e edição em modal, com gestão exclusiva para superusuários e proteção do próprio acesso.
- **Bancas:** pesquisa por nome, slug e grafias alternativas; filtros por disponibilidade e destaque; cadastro e edição em modal, com gravação transacional da grafia alternativa.
- **Concursos:** filtros distinguem origem, publicação, inscrições e UF; cadastro e edição em modal, consulta dos dados importados e confirmação de arquivamento/restauração.
- **Provas:** indicadores e filtros por visibilidade, vínculo, concurso e ano; cadastro em rascunho, edição em modal e confirmação para publicar ou ocultar.
- **Artigos:** indicadores por publicação, filtros e paginação no servidor; editor rico em modal, prévia das alterações atuais e confirmação das ações editoriais individuais ou em lote.
- **Notificações:** formulário em modal, preservando mídia, links, segmentação, adiamento e prévia; filtros e indicadores, confirmação das transições e acompanhamento individual dos destinatários.
- **Questões:** busca e paginação no servidor por enunciado/comentário, ID, status, origem, banca, disciplina, ano e ausência de comentário; cadastro em modal e separação entre salvar, enviar à fila e aprovar.
- **Fila de revisão:** filtros e seleção na URL, indicadores, paginação, layout móvel, restauração do rascunho e atualização da lista após aprovação/rejeição. Atalhos precisam ser ativados e não repetem gravações em andamento.
- **Fontes de questões:** indicadores de disponibilidade e fila, busca por nome/identificador/licença, ordenação e paginação; cadastro e configuração respeitam as permissões do Django.
- **Acervo de provas:** cadastro em modal, acesso aos portais oficiais, indicadores, filtros e paginação no servidor; histórico de downloads preservado e exportação JSON/ZIP com os filtros da lista.
- Indicadores globais são calculados antes dos filtros. As listas descartam respostas antigas e preservam busca, filtros, ordenação e página na URL.
- APIs de listagem mantêm compatibilidade com consumidores antigos sem paginação explícita.

### Fixed

- Atualizador executa o fluxo operacional quando chamado sem argumentos; `--plan` permanece somente consulta. Instalações por releases buscam o Git, preparam build isolado, preservam configurações/dados e promovem o ponteiro após backup e migrações.

- Corrigidas as URLs das consultas e exportações do acervo oficial para o namespace de conteúdo.
- O botão de busca de uma fonte agora abre os filtros daquela fonte, em vez de iniciar uma seleção genérica.
- Resultado das buscas distingue falha, processamento e conclusão parcial; simulações não são apresentadas como questões efetivamente importadas.
- Removido o corte de 200 documentos na consulta paginada do acervo. Exportações acima de 500 documentos exigem refinar os filtros, evitando truncamento silencioso.
- Seletores de provas e concursos usam opções resumidas independentes da página atual, preservando vínculos em catálogos maiores.
- Corrigida a leitura dos motivos de rejeição na fila, aceitando o formato de lista retornado pela API.
- Removido o teto incorreto de 120 caracteres no comentário da revisão. A interface usa o mínimo definido pela política de moderação e bloqueia aprovação enquanto ele não for atendido.
- Rascunhos de revisão são restaurados de `review_note`; conflitos de versão preservam o texto local para recuperação.
- Corrigidos filtros de banca, disciplina e ano da fila e seleção de fontes inativas que ainda possuem questões para revisar.
- Corrigidos agendamento na criação de artigos, retorno a rascunho ao remover a agenda e snapshots anteriores à edição para auditoria.
- Validação de ano e vínculos editoriais rejeita entradas inválidas antes de gravar; conflitos de grafia alternativa de banca não deixam alterações parciais.

### Security

- Ações administrativas respeitam também no servidor a separação entre consulta, edição, revisão, gestão de staff e acesso financeiro.
- Edições de questões e rascunhos de revisão verificam a versão lida para impedir sobrescrita silenciosa de alterações concorrentes.
- Exclusão de questão exige digitação do ID; aprovação com conflito de gabarito exige confirmação adicional.
- Conteúdo importado e contratos gerenciados pelo provedor continuam protegidos contra alterações locais indevidas.

### Removed

- Biblioteca de Materiais retirada temporariamente: removidos menu, atalho e salvamento no ChatIA, clientes e API de materiais. Links antigos redirecionam ao chat; dados salvos e migrações preservados.

- Conteúdo duplicado do próprio changelog, incluindo uma cópia antiga embutida em bloco de código.
- Etapas concluídas dos planos de maturidade administrativa e PWA, mantendo pendências e referências operacionais.
- Planos de descoberta `docs/fase-0-cadastros-conteudos.md` e `docs/fase-0-maturidade-admin.md`, removidos na revisão anterior; contratos preservados em documento consolidado.

### Validation

- Última consolidação de Fontes e Acervo: 30 testes de API, dois cenários Playwright, TypeScript, lint focado e verificação de diff aprovados. O cenário do acervo foi repetido após o ajuste final do formulário.
- Questões e Fila: 29 testes de API e dois cenários Playwright aprovados na etapa correspondente, além de TypeScript e lint focado.
- As verificações pertencem a suas respectivas etapas; não representam uma nova execução da suíte completa após todas as alterações.
- A limpeza dos planos e esta atualização do changelog alteram apenas documentação; links locais e formatação são verificados sem executar rotinas de produção.

## Atualizações de implementação e operação — 2026-10-18

Registro das etapas anteriores à consolidação visual. A implantação controlada
está descrita em [implantação de 18/10/2026](docs/implantacao-2026-10-18.md).
Não foi atribuída uma versão SemVer a esse conjunto.

### Added

- Matriz de autorização por grupos Administrador, Editor e Revisor, restrição de auditoria a superusuários e permissão específica adicional para diagnóstico.
- Central de notificações com destinatários selecionados ou segmentados, paginação de usuários, mídia e links validados, prévia compartilhada e acompanhamento individual.
- Publicação imediata e agendada, materialização assíncrona e idempotente do público e proteção contra repetição de jobs.
- Modal autenticado de avisos com confirmação, adiamento e isolamento entre destinatários.
- Auditoria em comandos, serviços e jobs, incluindo ingestão, moderação, publicação, backup/restauração e retenção; comparação legível de alterações e exportação redigida.
- Diagnóstico com logs filtrados e paginados, download limitado, catálogo fixo de rotinas de leitura, métricas de banco e estados de serviços por snapshots validados.
- Stripe Checkout hospedado, webhooks assinados, renovação, cancelamento ao fim do período e recibos financeiros normalizados com valor, moeda, fatura e período contratado.
- Relatórios de receita confirmada por período/plano/ciclo, comparação temporal, MRR/ARR, tickets e exportação CSV, com indicação de cobertura incompleta dos dados.
- Backup e restauração PostgreSQL por CLI, manifesto e hash, credenciais temporárias privadas e proteção do fluxo de restauração; suporte SQLite preservado.
- Configuração de mídia e backups persistentes, verificações de ambiente de produção e preparação de SMTP com timeout e validação de SSL/TLS.
- CI com Python 3.12 e Node 24, verificações de esquema, testes backend, lint, TypeScript, build e E2E com banco temporário.
- Registro de falhas com identificador de correlação, telas de recuperação e documentação para coletor e alertas externos.
- Integração OpenRouter com modelos gratuitos por padrão, recuperação lexical de questões aprovadas da plataforma e referências fornecidas pelo servidor.
- Biblioteca privada de materiais salvos a partir das respostas do assistente e criação confirmada de simulados usando as questões recuperadas.
- Prontidão, planejamento de deploy, manutenção explícita, backup anterior às migrações e modelos de serviços systemd e proxy nginx.

### Changed

- Cache PWA limitado ao fallback público e assets permitidos, sem persistir páginas autenticadas, APIs, login ou arquivos de usuário.
- Service worker servido por rota do Next com identidade do build; atualização depende de confirmação e instalação incompleta preserva o worker anterior.
- Chat e lousa adaptados a viewport móvel, altura dinâmica e safe-area; controle de tema reposicionado nessas telas para liberar os controles de estudo.
- Pipeline de atualização interrompe a operação em falhas de backup, migração ou prontidão, preservando a manutenção em vez de restaurar dados automaticamente.
- README, guias operacionais, contratos administrativos, referências de implantação e revisão de pendências atualizados.

### Fixed

- Corrigidos casos de repetição e ordenação de eventos financeiros, concorrência de cancelamento e confirmação tardia de pagamentos.
- Corrigidos registros duplicados ou incompletos de auditoria entre serviços, API e Admin Django.
- Corrigida a compatibilidade de extração de backups e reforçada a rejeição de caminhos externos e arquivos inseguros.
- Corrigida a normalização de respostas vazias que podia causar erro de renderização.

### Security

- Redação recursiva de credenciais e dados sensíveis antes de persistir ou devolver logs, auditoria e diagnósticos.
- Logs limitados por bytes/linhas, caminhos permitidos, rejeição de links e detecção de rotação; rotinas internas sem SQL ou código arbitrário enviado pelo navegador.
- Chave OpenRouter restrita ao backend; modelos pagos exigem habilitação explícita e não são usados como fallback automático.
- Webhooks Stripe verificam assinatura, modo e estado canônico; dados de cartão permanecem no checkout do provedor.
- Separação de mídia pública, arquivos privados, backups e segredos do ambiente.

### Deployment

- Implantação controlada com release isolada, Node 24 dedicado, SQLite e mídia persistentes, migrações, worker e timers.
- Backup e restauração isolada SQLite, persistência entre releases, bloqueio de acesso anônimo e comportamento do PWA na borda verificados.
- Chamada real ao OpenRouter com modelo gratuito e referência de questão recuperada validada na implantação registrada.
- Homologação financeira Stripe, envio transacional real, PostgreSQL, cópia externa dos backups, CI remota, alertas externos, dispositivos reais e observação de 48 horas permanecem sem aceite integral.
- Consolidações das páginas administrativas publicadas posteriormente pelo commit `5e50bd3`; prontidão e proteção das rotas verificadas. Homologação autenticada completa permanece operacional.

### Database

- Migrações adicionadas nesta sequência: `backoffice.0011`, `billing.0005` e `0006`, `notifications.0005`, `chat.0003` e `0004`.
- As migrações anteriores à implantação foram aplicadas conforme seu registro operacional. A consolidação visual posterior não introduziu novas migrações.
- Próximas publicações devem verificar o estado efetivo das migrações da release e preservar os dados existentes.

## Funcionalidades anteriores ainda sem versão atribuída

### Added

- Recuperação e alteração de senha com tokens de uso único e validação Django.
- Importador JSON/CSV idempotente para provas e questões, com modo `--dry-run`.
- Chat com contexto real, limites por plano e auditoria de tokens.
- Capacidades dos planos aplicadas às APIs de questões e chat.
- Estrutura inicial do monorepo: backend (Django + DRF + allauth + dj-rest-auth) e frontend (Next.js App Router).
- Documentação: README, docs/Google_Oauth.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md.
- Configuração OAuth Google (documentada) e utilitários para criação do SocialApp.
- Cliente HTTP axios no frontend com withCredentials e hook useAuth.
- .gitignore e .env.example.
- Private license (LICENSE).

### Changed

- Ajustes iniciais de CORS/CSRF para desenvolvimento local.

### Security

- Diretório `backend/keys` e variáveis sensíveis excluídos do versionamento.

## [0.1.0] - 2026-01-09
### Added
- Versão inicial pública do repositório com:
  - Backend: configurações base, migrações iniciais e instruções para criação de superuser.
  - Frontend: layout, página de login, página de dashboard e exemplos de integração OAuth.
  - Diagrama arquitetural em README (Mermaid).
  - Arquivos de suporte: LICENSE (privada), CODE_OF_CONDUCT.md, CHANGELOG.md (este arquivo).

## Manutenção deste arquivo

Adicionar mudanças em `[Unreleased]`, agrupadas por tipo. Ao publicar uma versão,
transferir apenas as mudanças efetivamente incluídas para a seção SemVer e data
correspondentes, com notas de migração e limites operacionais quando necessários.
