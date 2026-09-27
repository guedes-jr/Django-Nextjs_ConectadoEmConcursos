# Fase 0 — Contrato de compatibilidade de Cadastros e Conteúdos

Data de conclusão: 27/09/2026.

Este documento registra a descoberta técnica anterior ao desenvolvimento dos novos cadastros. Ele não altera dados, não executa sincronizações e não muda o comportamento público da aplicação.

## Decisões aprovadas para as próximas fases

1. **Bancas permanecem texto nos modelos atuais.** `Question.banca` e `Exam.banca` não serão convertidos para FK. O catálogo futuro servirá para nomes canônicos e aliases, e os fluxos novos gravarão o valor canônico em texto.
2. **Origem sincronizada é protegida.** `Concurso` e `NewsArticle` existentes são atualizados pelo comando `sync_sources` com `update_or_create(source, external_id)`. A primeira versão editorial não poderá editar os campos que esse comando controla. Campos curatoriais ou uma camada de edição manual serão definidos nas fases 2 e 4.
3. **A fila atual é o único caminho de aprovação de questões.** Criação manual futura começa em rascunho e a aprovação continuará usando o módulo `apps.questions.moderation`; não haverá segundo mecanismo de publicação.
4. **Permissões.** Os endpoints novos usam `IsAdminUser` como base. Ações de publicar e aprovar continuarão restritas a staff; uma distinção adicional de papéis só será criada se houver papel de editor/revisor no modelo de usuários.
5. **Preservação.** Migrações serão aditivas, vínculos serão opcionais inicialmente e desativação/arquivamento será preferido à exclusão física.

## Inventário de dependências

| Entidade | Modelo e contrato atual | Impacto a preservar |
| --- | --- | --- |
| Prova | `questions.Exam`; unicidade em `title`, `banca`, `year`; `banca` é texto | O pipeline de ingestão faz `update_or_create` usando essa chave. Um vínculo a concurso deve ser opcional. |
| Questão | `questions.Question`; origem opcional, estados `pending`, `approved`, `rejected` | A visibilidade pública depende da moderação; a fila e os mecanismos de duplicidade devem ser reutilizados. |
| Fonte de questão | `questions.QuestionSource` e `SearchRun` | Não é catálogo de banca. Buscas/importações continuam separados do cadastro manual. |
| Concurso | `concursos.Concurso`; único por `source`, `external_id` | O sincronizador pode regravar campos importados. Cadastro manual deverá ter origem reservada e proteção explícita. |
| Artigo | `concursos.NewsArticle`; único por `source`, `external_id`; slug único | O sincronizador também atualiza itens existentes. Produção editorial não pode colidir com sua proveniência. |

## Rotas existentes e limites atuais

| Rota administrativa | Método | Estado atual | Evolução prevista |
| --- | --- | --- | --- |
| `/api/backoffice/content/questions/` | GET, PATCH | Lista/modera, sem criação manual | Manter para compatibilidade; novo fluxo terá rotas específicas. |
| `/api/backoffice/content/questions/draft/` | POST | Rascunho de revisão/explicação no fluxo atual | Não substituir; avaliar extensão ou rota própria na Fase 3. |
| `/api/backoffice/content/questions/queue/` | GET | Fila e contexto de revisão | Acrescentar filtros de origem manual, prova e banca. |
| `/api/backoffice/content/concursos/` | GET | Listagem de itens sincronizados | Evoluir para listagem paginada e endpoints editoriais. |
| `/api/backoffice/content/news/` | GET, PATCH | Listagem e alternância de publicação | Evoluir para CRUD editorial sem quebrar a alternância existente. |
| `/api/backoffice/content/official-exams/*` | diversos | Descoberta/documentos do acervo | Continua operação independente; apenas terá links para provas. |

## Auditoria de bancas

Foi adicionado o comando somente de leitura abaixo. Ele agrupa valores de `Question.banca` e `Exam.banca` por uma normalização diagnóstica (Unicode, espaços e maiúsculas/minúsculas), sem criar aliases nem alterar registros:

```bash
cd backend
python manage.py audit_bancas
python manage.py audit_bancas --format=json --limit=100
```

A saída deve ser analisada antes de popular `BancaCatalog` na Fase 1. Variantes encontradas não devem ser mescladas automaticamente: a decisão do nome canônico é editorial.

## Regressões que as próximas fases devem cobrir

- ingestão continua encontrando/criando `Exam` pela chave já existente;
- `sync_sources` permanece idempotente para concursos e notícias;
- itens importados não sofrem sobrescrita por edição manual;
- lista pública só apresenta questões aprovadas e notícias publicadas;
- aprovação/rejeição continua passando por `moderation.py`;
- catálogo de banca não altera valores antigos até uma ação explícita e auditável;
- rotas administrativas existentes continuam respondendo para o frontend atual.
