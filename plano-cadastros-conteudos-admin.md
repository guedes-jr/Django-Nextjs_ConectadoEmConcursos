# Plano — Cadastros e Conteúdos do Admin

## 1. Objetivo

Criar um núcleo claro de **Cadastros e Conteúdos** no `/admin`, permitindo à equipe manter, com segurança e boa usabilidade:

- bancas organizadoras;
- concursos;
- provas;
- questões criadas manualmente e encaminhadas para revisão;
- artigos e conteúdos editoriais.

O resultado deve separar criação, revisão e publicação, preservar dados já importados e tornar evidente para o administrador o que cada área faz. Este plano complementa — e não substitui — `plano-banco-questoes.md` e `plano-acervo-provas-oficiais.md`.

## Status de implementação

- [x] Fase 0 — Descoberta, decisões e contrato de compatibilidade
- [x] Fase 1 — Fundação de bancas e normalização
- [x] Fase 2 — Concursos e provas editoriais
- [x] Fase 3 — Cadastro manual de questões e integração com fila
- [x] Fase 4 — Produção editorial de artigos
- [x] Fase 5 — Navegação, visão geral e consistência de UX
- [x] Fase 6 — Migração e qualidade local
- [ ] Entrada em produção — backup, migrações, reinício e validação pós-deploy

## 2. Diagnóstico do estado atual

| Domínio | Já existe | Lacuna a resolver |
| --- | --- | --- |
| Bancas | `Question.banca` e `Exam.banca` como texto | Não há catálogo, aliases, página de gestão ou padronização assistida. |
| Concursos | Modelo `Concurso` e listagem administrativa | Conteúdo é orientado à origem externa; falta fluxo seguro de criação/edição manual e curadoria. |
| Provas | Modelo `Exam`, acervo oficial e fluxo de documentos | Falta CRUD editorial claro, associação opcional a concurso e tela única de detalhes. |
| Questões | Pipeline de importação, fila, moderação e banco público | Falta formulário manual guiado, com rascunho e envio explícito à fila. |
| Artigos | Modelo `NewsArticle` e controle parcial de publicação | Falta autoria manual, rascunho, edição completa, prévia e agenda de publicação. |
| Navegação | Páginas operacionais dispersas no admin | Falta agrupamento por finalidade e caminhos entre entidades relacionadas. |

## 3. Decisões arquiteturais

### 3.1 Banca: catálogo sem quebra de compatibilidade

A primeira implementação **não converterá** `Question.banca` nem `Exam.banca` em chave estrangeira. O banco de questões usa texto livre normalizado de propósito, e uma migração direta pode quebrar importações, filtros e o acervo existente.

Será criado um catálogo editorial (`BancaCatalog` e, preferencialmente, `BancaAlias`) que fornece nome de exibição, slug, aliases e metadados. A gravação nas questões e provas continuará usando o nome canônico em texto. Um serviço de normalização resolverá aliases durante criação manual, importação e filtros administrativos.

Uma futura conversão para FK só será considerada após auditoria de cobertura e uma migração compatível, nunca como pré-requisito deste plano.

### 3.2 Separar origem importada e edição humana

Registros sincronizados não podem ser sobrescritos silenciosamente por edição manual nem o contrário. Todo conteúdo deverá informar sua procedência (`imported`, `manual` ou equivalente), usuário responsável e datas de criação/atualização.

Para campos em que a sincronização externa continue ativa, a implementação deverá optar por uma destas estratégias antes de liberar a edição:

1. bloquear edição dos campos sincronizados e permitir apenas campos curatoriais; ou
2. manter uma camada de curadoria manual separada dos dados de origem.

A mesma regra vale para concursos e notícias.

### 3.3 Publicação com etapas explícitas

- Questões manuais entram como rascunho e só passam a `PENDING` mediante ação do usuário.
- Questões só ficam públicas após a revisão já existente (`APPROVED`), nunca pelo formulário de cadastro.
- Artigos terão estados de rascunho, agendado, publicado e arquivado.
- Concursos e provas terão visibilidade editorial separada de mero registro importado quando necessário.
- Exclusão física será evitada para itens com vínculos; deve-se preferir arquivamento/desativação.

### 3.4 Permissões e rastreabilidade

Todos os endpoints serão restritos a equipe autorizada. Criações, alterações de status, publicação, arquivamento e revisão deverão registrar o usuário, data e uma trilha de auditoria suficiente para suporte.

## 4. Experiência e organização do admin

Adicionar no menu administrativo a seção **Cadastros e conteúdos**, mantendo as áreas operacionais já existentes em **Operação**.

```text
Admin
├── Cadastros e conteúdos
│   ├── Visão geral
│   ├── Bancas
│   ├── Concursos
│   ├── Provas
│   ├── Questões
│   └── Artigos
└── Operação
    ├── Fontes de questões
    ├── Fila de revisão
    ├── Acervo de provas oficiais
    ├── Relatórios
    └── Backups
```

A página de visão geral mostrará contadores e atalhos para: rascunhos, questões aguardando revisão, provas sem vínculo, concursos pendentes de curadoria e artigos agendados. Ela não deve duplicar a fila; deve apontar para ela.

Cada listagem seguirá o mesmo padrão:

- busca, filtros, paginação e estado vazio explicativo;
- botão de criação com linguagem específica do domínio;
- visualização/detalhe antes de ações de risco;
- ações por registro: editar, publicar/enviar para revisão, arquivar;
- mensagens de sucesso e de erro acionáveis;
- links para registros relacionados.

## 5. Modelo de dados e regras por domínio

### 5.1 Catálogo de bancas

Criar `BancaCatalog` com, no mínimo:

- `name`: nome canônico, único sem distinção de maiúsculas/minúsculas;
- `slug`: identificador estável para URLs e filtros;
- `official_url`, `description` e imagem opcional;
- `is_active`, `is_featured`;
- `created_by`, `updated_by`, timestamps.

Criar `BancaAlias` relacionado ao catálogo:

- `alias` normalizado e único;
- `banca` de destino;
- indicação de origem manual/importada quando útil.

Regras:

- impedir alias igual ao nome canônico de outra banca;
- mostrar a quantidade de provas e questões que usam o nome canônico;
- ao desativar, preservar registros antigos e impedir novas seleções no formulário;
- manter um serviço único de `normalize_banca(value)` para APIs, importadores e cadastros.

### 5.2 Concursos

Aproveitar o modelo `Concurso` existente; não criar um segundo cadastro concorrente.

Evoluções previstas:

- origem e campos de auditoria editorial;
- estado editorial (rascunho/publicado/arquivado) quando não houver equivalente seguro;
- edição manual dos campos autorizados;
- proteção para dados sincronizados, conforme a estratégia definida na seção 3.2;
- relação opcional com provas;
- página de detalhe com dados do concurso, provas vinculadas e links externos.

Validações: título, órgão/instituição, localidade, status e URLs válidas; salário, vagas e datas coerentes; mensagens claras para campos bloqueados por sincronização.

### 5.3 Provas

Evoluir `Exam` sem interromper o fluxo de ingestão já existente:

- incluir `concurso` opcional (`ForeignKey` para `Concurso`, `SET_NULL`);
- permitir associação a uma banca do catálogo na interface, persistindo o texto canônico no campo existente;
- adicionar autor/último editor e, se necessário, estado de rascunho compatível com `is_published`;
- manter título, instituição, cargo, ano, nível, UF e publicação como campos de busca.

A tela de prova reunirá metadados, documentos do acervo oficial, contagem de questões, relação com concurso e ações de edição. O cadastro manual não fará download nem importação automática: esses continuam nas páginas operacionais do acervo.

### 5.4 Questões manuais

Criar um fluxo próprio em **Cadastros e conteúdos → Questões**, distinto da lista pública e da fila:

1. selecionar ou criar contexto de prova;
2. informar enunciado, disciplina, assunto, banca, nível e localização quando aplicável;
3. cadastrar alternativas, gabarito, explicação e referência;
4. salvar como rascunho ou enviar para revisão;
5. acompanhar o registro pela fila já existente.

Regras críticas:

- reutilizar o modelo `Question`, suas validações e seus estados de moderação;
- origem manual identificável;
- mínimo de alternativas configurável conforme o tipo objetivo;
- exatamente uma alternativa correta nas questões de múltipla escolha;
- proibir publicação direta;
- validar duplicidade básica por prova, enunciado normalizado e alternativas;
- exibir aviso de direitos autorais e campo de fonte/referência;
- permitir edição de rascunhos e devolvidos; itens em revisão/aprovados seguem regras de permissão e auditoria.

A fila de revisão continuará em página própria e receberá filtros para origem manual, prova, banca e responsável.

### 5.5 Artigos

Evoluir `NewsArticle` para suportar produção editorial, evitando um modelo duplicado:

- origem manual versus importada;
- `author`, `updated_by`, e timestamps adequados;
- status `draft`, `scheduled`, `published`, `archived`;
- `scheduled_for` com validação de fuso e data futura;
- título, resumo, corpo, categoria, capa, slug e SEO básico;
- prévia autenticada antes da publicação.

Para notícias importadas, aplicar a proteção de origem da seção 3.2. Para textos manuais, o slug será reservado no salvamento e haverá aviso de colisão. O corpo deverá passar por sanitização compatível com o formato adotado pela aplicação.

## 6. Contratos de API

Concentrar os endpoints administrativos sob o namespace já usado pelo backoffice, com respostas paginadas e estáveis. Nomes finais devem respeitar os padrões existentes, mas a cobertura esperada é:

| Recurso | Operações |
| --- | --- |
| Bancas | listar, detalhar, criar, editar, ativar/arquivar, gerenciar aliases |
| Concursos | listar, detalhar, criar manualmente, editar campos permitidos, publicar/arquivar |
| Provas | listar, detalhar, criar, editar, vincular concurso, publicar/arquivar |
| Questões manuais | listar rascunhos, criar, editar, validar, enviar/devolver para fila |
| Artigos | listar, detalhar, criar, editar, pré-visualizar, agendar, publicar, arquivar |
| Visão geral | indicadores agregados e links de destino |

Padrões obrigatórios:

- permissões de equipe em todos os endpoints;
- filtros por texto, status, origem, banca, concurso, prova e período quando aplicável;
- paginação e ordenação com limites seguros;
- erros estruturados por campo e mensagem geral; sem retornar exceções internas;
- ações de mudança de estado idempotentes quando possível;
- auditoria do ator e motivo opcional para arquivamento/devolução;
- serializadores separados para lista, detalhe e escrita quando isso simplificar validações.

## 7. Fases de implementação

### Fase 0 — Descoberta, decisões e contrato de compatibilidade

- Mapear endpoints, permissões, importadores, jobs e telas que já dependem de `Concurso`, `Exam`, `Question` e `NewsArticle`.
- Auditar valores distintos de banca e estimar cobertura de normalização.
- Definir a política definitiva para campos sincronizados e conteúdo manual.
- Definir quem pode publicar artigos e aprovar questões.
- Escrever contrato de rotas, payloads, filtros e erros antes das telas.

**Saída:** decisão registrada, inventário de impactos e testes de regressão planejados.

**Status: concluída em 27/09/2026.** Inventário, decisões de compatibilidade e roteiro de regressão registrados em `docs/fase-0-cadastros-conteudos.md`; auditoria somente de leitura disponível via `python manage.py audit_bancas`.

### Fase 1 — Fundação de bancas e normalização

- Criar modelos, migração, admin interno e serviço de normalização.
- Criar API de catálogo e aliases.
- Popular apenas com dados auditados ou via tela administrativa; nenhuma importação automática sem comando autorizado.
- Atualizar cadastros manuais para consumir o catálogo sem converter os campos de texto existentes.
- Criar testes de unicidade, colisão de aliases, desativação e normalização.

**Critério de aceite:** uma banca pode ter nome canônico e aliases; novos cadastros gravam o nome canônico e dados antigos continuam legíveis.

**Status: concluída em 27/09/2026.** Implementados `BancaCatalog` e `BancaAlias`, migração `0022_banca_catalog`, normalização compatível com aliases históricos, API administrativa protegida, gestão no Django Admin e testes focados. Nenhum registro de questão ou prova foi migrado automaticamente.

### Fase 2 — Concursos e provas editoriais

- Implementar migrações compatíveis para vínculo opcional de prova a concurso e campos editoriais necessários.
- Criar serviços, serializadores e endpoints CRUD seguros.
- Criar listagens, formulários, detalhes e vínculos cruzados no admin.
- Manter o acervo oficial como operação independente, apenas conectado por links e relações.
- Criar testes de edição manual, proteção de origem, vínculo e arquivamento.

**Critério de aceite:** a equipe cria e edita concurso/prova sem apagar dados sincronizados, e consegue navegar entre os dois e seus documentos/questões.

**Status: concluída em 27/09/2026.** Adicionados origem e auditoria editorial para concursos, vínculo opcional de prova a concurso, APIs protegidas, telas de cadastro/listagem e ações editoriais no admin. Itens sincronizados permanecem protegidos contra alteração de campos de origem.

### Fase 3 — Cadastro manual de questões e integração com fila

- Criar endpoints de rascunho, validação e envio para revisão.
- Construir formulário em etapas com salvamento de rascunho e feedback por campo.
- Reutilizar o motor atual de moderação; não criar um segundo fluxo de aprovação.
- Melhorar filtros e links da fila para origem manual e contexto da prova.
- Cobrir alternativas, gabarito, duplicidade, permissões e transições de estado em testes.

**Critério de aceite:** um administrador cria uma questão completa, envia-a à fila e um revisor a aprova sem intervenção no banco de dados.

**Status: concluída em 27/09/2026.** Criado fluxo de rascunho manual com validação de alternativas, gabarito e referência, envio explícito para a fila única de revisão, origem identificável e tela administrativa em `/admin/questoes`.

### Fase 4 — Produção editorial de artigos

- Evoluir modelo e migrações de `NewsArticle` com compatibilidade para itens existentes.
- Criar API e tela de listagem/formulário/detalhe/prévia.
- Implementar publicação imediata, agendamento e arquivamento, com job apenas se a infraestrutura atual já o suportar.
- Sanitizar conteúdo e validar slug, imagem e datas.
- Criar testes de estados, permissões, prévia e conflitos de slug.

**Critério de aceite:** a equipe redige, revisa, agenda e publica um artigo manual sem afetar notícias importadas.

**Status: concluída em 27/09/2026.** Implementado ciclo editorial de artigos manuais com rascunho, publicação, arquivamento e agendamento; o comando `publish_scheduled_news` efetiva publicações vencidas sem alterar itens importados.

### Fase 5 — Navegação, visão geral e consistência de UX

- Reorganizar navegação administrativa sem remover URLs antigas abruptamente.
- Adicionar visão geral, breadcrumbs, links entre entidades e estados vazios.
- Padronizar componentes de filtros, tabelas, formulários, confirmação e mensagens de erro.
- Adicionar redirecionamentos/links de compatibilidade se uma tela anterior for substituída.
- Validar desktop e mobile administrativo.

**Critério de aceite:** cada função é descobrível pelo menu e o usuário entende se está cadastrando, operando ou revisando conteúdo.

**Status: concluída em 27/09/2026.** Navegação reorganizada por finalidade, visão geral de Cadastros e conteúdos adicionada em `/admin/cadastros`, e página de Bancas criada para completar o acesso ao catálogo.

### Fase 6 — Migração, qualidade e entrada em produção

- Executar migrações em ambiente de homologação e conferir dados existentes.
- Rodar verificações Django, migration check, testes focados e lint/typecheck do frontend.
- Testar manualmente os fluxos ponta a ponta e perfis sem permissão.
- Preparar roteiro de deploy, checklist de variáveis, backup e rollback de migração.
- Liberar por etapas: catálogo → concursos/provas → questões → artigos → navegação final.

**Critério de aceite:** deploy reproduzível, sem migrações pendentes, sem regressão do banco de questões, acervo ou notícias existentes.

**Status: implementação e validação local concluídas em 27/09/2026.** Suíte backend, verificações Django/migrações, lint e typecheck aprovados. A publicação permanece pendente porque requer backup e execução controlada no ambiente de produção.

## 8. Matriz de testes e validação

| Área | Casos essenciais |
| --- | --- |
| Bancas | nome/alias duplicado, alias ambíguo, normalização, desativação, permissões |
| Concursos | manual/importado, campos protegidos, datas/URLs, arquivamento, vínculo a prova |
| Provas | unicidade atual preservada, concurso opcional, banca canônica, documentos e questões relacionados |
| Questões | rascunho, alternativas inválidas, gabarito, duplicidade, envio, devolução e aprovação |
| Artigos | slug, sanitização, rascunho, agenda, publicação, arquivamento, prévia e autor |
| APIs | paginação, filtros, erros por campo, acesso não autorizado e auditoria |
| Frontend | carregamento, vazios, erro de rede, confirmação de ações e navegação por links |
| Regressão | importadores, fila existente, acervo oficial, listagens públicas e notícias existentes |

## 9. Migração e rollout

1. Fazer backup e registrar contagens dos registros atuais.
2. Aplicar primeiro mudanças aditivas: tabelas de catálogo, campos anuláveis e novos índices.
3. Disponibilizar APIs e telas sem tornar campos novos obrigatórios.
4. Validar cadastros manuais em homologação.
5. Fazer backfill somente após revisão de dados e com comando explícito, reversível e registrado.
6. Ativar novos atalhos no menu e acompanhar erros/auditoria.
7. Só depois considerar regras mais rígidas ou descontinuação de telas antigas.

Rollback: manter migrações reversíveis quando possível; preferir desativar rotas/recursos novos a apagar dados; não executar exclusões em massa durante deploy.

## 10. Fora de escopo desta iniciativa

- Converter imediatamente todas as bancas textuais para chaves estrangeiras.
- Reimportar questões, provas, concursos ou notícias automaticamente.
- Alterar o mecanismo público de busca/estudo além do necessário para compatibilidade.
- Extrair questões automaticamente de PDFs; isso permanece no plano do acervo e na operação de revisão.
- Criar CMS genérico para páginas institucionais não relacionadas a artigos.

## 11. Ordem recomendada de execução

1. Fase 0 e aprovação das decisões de origem/permissões.
2. Fase 1 (bancas), pois alimenta os demais formulários.
3. Fase 2 (concursos e provas).
4. Fase 3 (questões manuais e fila).
5. Fase 4 (artigos).
6. Fase 5 e Fase 6 em seguida.

## 12. Decisões a confirmar antes do código

A recomendação deste plano é iniciar com as opções abaixo:

1. **Bancas:** catálogo e aliases, preservando os campos textuais de questão/prova.
2. **Concursos e notícias importados:** edição manual limitada a campos curatoriais, sem sobrescrever a origem.
3. **Publicação:** somente perfis administrativos autorizados publicam artigos; somente revisores aprovam questões.
4. **Exclusão:** arquivamento por padrão; exclusão física apenas para rascunhos sem vínculos.

Se alguma dessas decisões mudar, a Fase 0 deverá ajustar contrato, migrações e critérios de aceite antes do desenvolvimento.
