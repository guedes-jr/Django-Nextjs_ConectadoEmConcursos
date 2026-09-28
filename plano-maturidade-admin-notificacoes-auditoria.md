# Plano — Maturidade do Admin, Notificações e Auditoria

## Objetivo

Evoluir o admin de um conjunto de telas operacionais para uma área editorial e de governança completa. O escopo inclui edição detalhada dos cadastros existentes, notificações disparadas pela equipe e uma trilha de auditoria confiável.

Este plano evolui os cadastros e conteúdos já entregues; não altera os fluxos existentes de banco de questões nem de acervo de provas oficiais.

## Status

- [x] Fase 0 — Decisões, permissões e contrato de dados
- [x] Fase 1 — Detalhes e edição completa de cadastros
- [x] Fase 2 — Central de notificações administrativas
- [x] Fase 3 — Modal de avisos para alunos
- [x] Fase 4 — Auditoria e histórico administrativo
- [ ] Fase 5 — Relatórios de negócio, produto e operação
- [x] Fase 6 — Ferramentas de diagnóstico para desenvolvimento
- [x] Fase 7 — Painéis, permissões e qualidade
- [ ] Fase 8 — Deploy controlado e operação

## Princípios

- Nenhum aviso deve bloquear permanentemente o aluno: “Ver mais tarde” adia a apresentação, enquanto “Confirmar visualização” registra a ciência.
- Avisos destinados a usuários específicos não podem ser acessados por terceiros, mesmo por tentativa direta de URL/API.
- Conteúdo importado continua protegido contra edição de campos sincronizados.
- Ações administrativas relevantes devem ser auditáveis, mas senhas, tokens, cookies, dados de pagamento e conteúdo sensível não podem entrar no log.
- Exclusão deve continuar sendo exceção: preferir arquivamento, desativação e histórico.

## Fase 0 — Decisões e contratos

Definir antes de criar modelos:

1. Perfis: `admin`, `editor`, `revisor` e permissões mínimas de cada um.
2. Política de adiamento: recomendação de 24 horas, com limite de adiamentos configurável por aviso.
3. Tipos de aviso: informativo, manutenção, novidade, urgência e obrigatório.
4. Alcance: todos os usuários ativos, segmento por plano/status, ou lista explícita de usuários.
5. Formato de mídia: imagens por URL/upload validado; vídeo por URL incorporável permitida; links HTTP(S) com texto acessível.
6. Retenção da auditoria: recomendação mínima de 12 meses, com acesso restrito a administradores.

**Saída:** matriz de permissões, regras de retenção e contrato de payloads documentados.

**Status: concluída em 27/09/2026.** Decisões, matriz de permissões, política de adiamento, separação das notificações existentes e contrato de auditoria registrados em `docs/fase-0-maturidade-admin.md`.

## Fase 1 — Detalhes e edição completa

Completar as telas existentes:

- Bancas: detalhe, edição, aliases, ativação, destaque e contagem de uso.
- Concursos: edição manual permitida, detalhe com provas vinculadas, filtros e arquivamento.
- Provas: edição, vínculo/desvínculo de concurso, dados de banca, questões relacionadas e visibilidade.
- Questões manuais: editar rascunhos/devolvidas, selecionar prova, utilizar catálogo de banca e exibir motivo de rejeição.
- Artigos: editar rascunho, prévia autenticada, capa, slug, categoria, agenda e arquivamento.
- Paginação, busca, filtros e estados vazios padronizados em todas as listagens.

**Critério de aceite:** nenhum cadastro editorial exige Admin Django ou banco de dados para manutenção comum.

**Status: concluída em 27/09/2026.** Telas administrativas de bancas, concursos, provas, questões manuais e artigos passaram a oferecer criação, edição e ações editoriais compatíveis com as APIs existentes; itens sincronizados seguem protegidos.

## Fase 2 — Central de notificações administrativas

### Modelo de dados

- [x] Criar `AdminNotification` com estados, alcance, prioridade, mídia, período, adiamento, autoria e timestamps.
- [x] Criar `NotificationRecipient` com origem, estado e histórico de adiamento.
- [x] Materializar o público amplo em tarefa django-q paginada.
- [x] Incluir o escopo por segmento (plano/status de assinatura), materializado em tarefa assíncrona.
- [x] Expor no formulário os controles de plano e status de assinatura para o segmento.

Criar `AdminNotification`:

- título, resumo opcional e corpo rico sanitizado;
- tipo e prioridade;
- imagem opcional, URL de vídeo opcional e links estruturados;
- status: rascunho, agendado, publicado, encerrado, arquivado;
- início/fim de exibição e configuração de adiamento;
- escopo (`all`, `segment`, `selected_users`);
- criador, último editor, publicação e timestamps.

Criar `NotificationRecipient`:

- notificação e usuário;
- origem do destinatário (selecionado, segmento, todos);
- estado: pendente, visualizado, adiado, dispensado;
- primeira exibição, confirmação, próximo lembrete e quantidade de adiamentos.

Para grandes públicos, destinatários devem ser materializados em job assíncrono e paginado, nunca em uma única requisição web.

### Tela administrativa

- [x] Adicionar `/admin/notificacoes` com criação, edição, seleção explícita, alcance amplo, agendamento e publicação.
- [x] Exibir métricas iniciais de destinatários, pendências, visualizações e adiamentos.
- [ ] Adicionar prévia visual, busca/paginação/seleção em lote de usuários, filtros por plano/status, encerramento e arquivamento.

Adicionar `/admin/notificacoes` com:

- lista com status, alcance, período e métricas;
- criação em rascunho com prévia visual;
- seletor de usuários por busca/paginação e seleção em lote;
- filtros por plano, status de assinatura e usuários ativos quando esse escopo for habilitado;
- agendamento, publicação, encerramento e arquivamento;
- métricas: enviados, pendentes, confirmados, adiados e taxa de confirmação.

### Validações

- [x] título obrigatório, usuários ativos no escopo selecionado e congelamento dos destinatários ao publicar;
- [x] publicação idempotente e proteção contra materialização na requisição web;
- [x] sanitização de conteúdo, validação de mídia/links HTTP(S), allowlist de vídeo e coerência de datas.
- [x] encerramento seguro com justificativa obrigatória para avisos obrigatórios e arquivamento preservando histórico.
- [x] Expor encerramento, arquivamento e métricas de destinatários, confirmações e adiamentos na tela.
- [x] Adicionar prévia visual e filtros rápidos por título/status.
- [x] Implementar busca e seleção em lote de usuários, com limite seguro por página; segmentação por plano/status disponível.
- [x] Concluir a revisão final de qualidade da Fase 2.

- título obrigatório; mídia e links com URL válida;
- HTML sanitizado ou editor estruturado; sem scripts/iframes arbitrários;
- vídeos apenas de provedores permitidos;
- data de término posterior à de início;
- aviso obrigatório não pode ser encerrado sem justificativa de auditoria;
- ao publicar para usuários específicos, congelar a lista de destinatários.

**Critério de aceite:** um administrador cria um aviso, seleciona usuários, publica e acompanha individualmente quem confirmou ou adiou.

**Status: concluída em 27/09/2026.** Modelos aditivos `AdminNotification` e `NotificationRecipient`, migração, gestão de contingência no Admin Django e API administrativa protegida para rascunho, edição, seleção explícita e publicação idempotente concluídos. Tela administrativa `/admin/notificacoes` concluída, com rascunho, seleção de usuários, edição, publicação e métricas iniciais. Materialização em job para público amplo e agendamento também concluídos; Revisão final concluída: migration check, 20 testes do app de notificações, typecheck, lint e verificação de diff aprovados.

## Fase 3 — Modal de avisos para alunos

### API do aluno

- endpoint para buscar o próximo aviso elegível do usuário autenticado;
- endpoint para confirmar visualização;
- endpoint para adiar, retornando a próxima data de exibição;
- resposta inclui apenas mídia e links sanitizados autorizados.

### Experiência

Ao iniciar sessão e abrir uma área autenticada:

1. consultar avisos pendentes elegíveis;
2. exibir um modal acessível com título, texto, imagem/vídeo e links;
3. oferecer exatamente duas ações principais:
   - **Confirmar visualização**: registra ciência e remove o aviso;
   - **Ver mais tarde**: adia conforme regra configurada.
4. bloquear fechamento por clique externo apenas para avisos marcados como obrigatórios; ainda assim, manter as duas ações explícitas.

Requisitos de acessibilidade: foco preso no modal, `aria` apropriado, teclado, contraste e texto alternativo para imagem. Vídeo não pode tocar automaticamente com áudio.

**Critério de aceite:** o usuário só vê avisos destinados a ele, consegue confirmar ou adiar, e o admin vê o resultado correto.

**Status: concluída em 27/09/2026.** API autenticada criada para buscar somente o próximo aviso elegível, confirmar visualização e adiar com limite configurado; há teste de isolamento entre usuários. Modal integrado ao layout autenticado, com foco gerenciado pelo diálogo, conteúdo sanitizado, confirmação e adiamento; avisos obrigatórios bloqueiam fechamento externo e por Escape. Revisão final concluída: há cobertura de isolamento, confirmação, adiamento e limite de adiamentos; migration check, 22 testes de notificações, typecheck, lint e verificação de diff aprovados.

## Fase 4 — Auditoria e histórico administrativo

Criar `AuditEvent` com:

- ator (usuário ou sistema), ação, recurso, identificador e contexto;
- estado anterior/posterior com campos permitidos e valores redigidos;
- IP, user-agent e origem da requisição quando aplicável;
- data/hora imutável, correlação de requisição e motivo opcional.

Eventos mínimos:

- criação/edição/arquivamento de bancas, concursos, provas, artigos e notificações;
- criação, envio, aprovação, rejeição e reabertura de questões;
- publicação, encerramento e alteração de destinatários de notificações;
- alterações de plano, assinatura, staff e permissões;
- backups/restaurações e ações de importação.

Adicionar `/admin/auditoria`:

- busca por ator, recurso, ação, período e identificador;
- detalhe com diff legível e dados redigidos;
- paginação, exportação limitada e acesso apenas para administradores autorizados.

Implementar auditoria em serviços e pontos de transição, não apenas em signals genéricos, para registrar intenção e motivo. Eventos de sistema devem informar o job/comando responsável.

**Critério de aceite:** uma ação editorial relevante pode ser rastreada até ator, horário, dados alterados e motivo, sem expor segredos.

**Status: em andamento em 27/09/2026.** Criados `AuditEvent`, migração inicial do backoffice e serviço de registro com redação de chaves sensíveis, IP, user-agent, correlação opcional e imutabilidade. Auditoria integrada às transições de criação, edição, agendamento, publicação, encerramento e arquivamento de notificações. Consulta administrativa paginada criada em `/api/backoffice/audit/`, com filtros por ação, recurso, identificador e ator. Tela administrativa `/admin/auditoria` concluída, com filtros, paginação e detalhe de snapshots redigidos. Auditoria também integrada às ações de aprovação e rejeição da fila de questões. Restam integrar cadastros, artigos, assinaturas, backups/importações e definir política de retenção.

## Fase 5 — Relatórios de negócio, produto e operação

Criar `/admin/relatorios/negocio` com filtros de período, comparação com período anterior, exportação CSV limitada e indicadores calculados no backend. Valores financeiros devem obedecer o fuso horário e o status real da assinatura, nunca apenas tentativas de cobrança.

### Financeiro

- Receita recorrente mensal (MRR) e anualizada (ARR).
- Receita recebida por período, por plano e por ciclo.
- Novas assinaturas pagas, renovações, cancelamentos, inadimplência e reativações.
- Ticket médio, distribuição por plano e evolução de conversão de assinatura pendente para ativa.
- Reembolsos, descontos e falhas de pagamento, se essas informações existirem no provedor.

### Crescimento e mercado

- Cadastros novos, usuários ativos (DAU/WAU/MAU) e taxa de ativação.
- Novos assinantes por dia/semana/mês e crescimento percentual versus período anterior.
- Funil: visitante identificado quando disponível → cadastro → primeiro estudo → assinatura ativa.
- Origem de aquisição quando houver UTM/referrer persistido; sem inventar atribuição ausente.
- Distribuição geográfica agregada somente se houver dado consentido e suficiente.

### Produto e aprendizado

- Questões respondidas, taxa de acerto, sessões de estudo, simulados concluídos e tempo estudado.
- Conteúdo mais acessado: disciplinas, bancas, provas, artigos e fontes.
- Uso de recursos: flashcards, cadernos, anotações, chat e relatórios.
- Saúde do banco de questões: pendentes, aprovadas, rejeitadas, taxa de duplicidade e tempo médio na fila.

### Retenção e suporte

- Coortes de cadastro e assinatura, retenção em 7/30/90 dias e churn.
- Usuários em risco: queda de atividade, assinatura perto do vencimento ou pagamento pendente.
- Solicitações/erros reportados por categoria e tempo de resolução quando houver dados.

### Requisitos

- Indicadores com definição visível, período e data/hora de atualização.
- Permissão financeira separada: somente administradores autorizados veem valores individuais ou agregados sensíveis.
- Dados agregados por padrão; listas de usuários apenas quando necessárias para ação operacional.
- Consultas com índices, paginação e limites para não afetar a experiência do aluno.
- Registrar exportações e acesso a relatórios financeiros na auditoria.

**Critério de aceite:** a equipe consegue avaliar receita, crescimento, conversão, retenção, uso do produto e saúde operacional em uma única área, com períodos e definições confiáveis.

## Fase 6 — Ferramentas de diagnóstico para desenvolvimento

Criar `/admin/diagnostico` como área técnica independente, acessível somente a superusuários explicitamente autorizados. Ela não substitui observabilidade externa, mas acelera a investigação de incidentes sem acesso SSH imediato.

### Abas da página

1. **Visão geral**
   - healthcheck consolidado, versão da aplicação, ambiente, horário do servidor e última atualização;
   - CPU, memória, armazenamento e carga do processo em tempo quase real, com atualização manual e intervalo seguro;
   - limites configurados e alertas visuais de capacidade.

2. **Serviços**
   - status do backend Django/ASGI/WSGI, frontend Next.js, worker de tarefas, agendador e proxy quando a infraestrutura expuser esses dados;
   - tempo de resposta dos healthchecks, última reinicialização conhecida e falhas recentes;
   - ação de reinício **não** será incluída na primeira versão: continua procedimento de infraestrutura auditável.

3. **Banco de dados**
   - conectividade, latência de uma consulta simples, versão, tamanho lógico, conexões ativas e migrações pendentes;
   - métricas agregadas de consultas lentas apenas se o banco fornecer esses dados;
   - nenhuma senha, string de conexão ou resultado sensível é retornado ao navegador.

4. **Logs**
   - acesso paginado e somente leitura aos logs permitidos da aplicação, worker e proxy;
   - filtros por serviço, severidade, período, correlação de requisição e texto;
   - download limitado, mascaramento de segredos/tokens e auditoria de toda consulta ou exportação;
   - nunca expor caminhos arbitrários, logs do sistema inteiro ou arquivos fora da allowlist.

5. **Console Django controlado**
   - executar somente scripts Python curtos, assincrônicos e com timeout/limite de memória;
   - execução no contexto Django (`django.setup()`), com saída truncada e preservada para auditoria;
   - modo padrão estritamente somente leitura, bloqueando escrita em ORM e acesso a rede/subprocesso;
   - operações de escrita apenas via scripts salvos e revisados, com confirmação dupla, justificativa e permissão adicional;
   - não disponibilizar terminal de sistema, shell interativo, `exec` livre ou acesso a variáveis de ambiente.

### Arquitetura e segurança

- Endpoint exclusivo de diagnóstico com `IsSuperuser` mais permissão específica e feature flag de ambiente; desabilitado por padrão em produção até configuração explícita.
- Coleta de métricas feita no backend ou agente interno com allowlist; o navegador nunca executa comandos no servidor.
- Rate limit, timeout, limite de resultado, cancelamento e fila isolada para diagnósticos caros.
- Toda abertura de log, execução de script e resultado gera `AuditEvent` com ator, horário, hash do script e contexto.
- Segredos mascarados antes de persistir ou enviar qualquer saída.

**Critério de aceite:** um desenvolvedor autorizado diagnostica a saúde da aplicação, serviços, banco e logs por abas sem ampliar indevidamente a superfície de ataque do ambiente de produção.

**Status: concluída em 28/09/2026.** Área `/admin/diagnostico` entregue em abas de visão geral, serviços, banco, logs por allowlist e scripts revisados somente leitura. O acesso exige superusuário e `DIAGNOSTICS_ENABLED=1`; consultas a logs e scripts geram auditoria. A operação está documentada em `docs/operacao-diagnostico.md`.

## Fase 7 — Painéis, permissões e qualidade

- Dashboard editorial com rascunhos, avisos agendados, confirmações pendentes, questões na fila e falhas de jobs.
- Permissões por papel, substituindo o acesso amplo de todo `is_staff` nas ações críticas.
- Testes de autorização, isolamento de destinatários, sanitização, agendamento, adiamento e retenção.
- Testes de regressão de conteúdo importado, fila de questões e acervo oficial.
- Métricas operacionais: tempo de confirmação, falhas de entrega/materialização e ações administrativas.

**Status: concluída em 28/09/2026.** Painel editorial ampliado com falhas de auditoria e confirmações recentes. Papéis `Administrador`, `Editor` e `Revisor` foram materializados por grupos, preservando staffs existentes como Administradores; criação e alteração de staff/papéis são exclusivas de superusuários. Há testes de autorização de diagnóstico, isolamento de superusuário e criação de papéis.

## Fase 8 — Deploy e operação

1. Backup e contagem dos dados afetados.
2. Migrações aditivas; não criar destinatários em massa durante a migração.
3. Configurar worker/cron para publicação e materialização de notificações.
4. Validar modal com usuário de teste e isolamento entre usuários.
5. Definir rotina de retenção/limpeza de auditoria.
6. Monitorar erros e métricas por 48 horas antes de ampliar o uso.

## Fora de escopo inicial

- Push notification, e-mail, WhatsApp ou SMS; a primeira versão é in-app.
- Editor livre de HTML ou upload de vídeo próprio.
- Exclusão automática de eventos de auditoria sem política de retenção aprovada.
- Conversão automática de todos os avisos existentes, pois não há modelo anterior equivalente.
