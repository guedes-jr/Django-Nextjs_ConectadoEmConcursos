# Plano de implementação — Banco de questões com fila de aprovação

Objetivo: importar questões de fontes seguras (dataset aberto, API pública, índice
oficial e envio do aluno), com resposta e metadados de prova/banca, gerar uma fila
de aprovação onde o admin confere questão a questão, escreve o gabarito comentado e
confirma ou rejeita. Só a questão aprovada fica disponível para o usuário comum.

## Escopo

- **Entra:** proveniência, filtros por fonte, pipeline de ingestão idempotente,
  detecção de duplicata por similaridade de enunciado, fila de aprovação, tela de
  revisão sequencial, conversão de envio do aluno.
- **Não entra:** scraper de banco de questões comercial, modelos `Banca`/`Disciplina`
  (banca e disciplina continuam texto normalizado), rotina automática de
  sincronização, alterações no `sync_sources` de concursos.

## Fluxo ponta a ponta

```
1. Escolher a fonte          (uma por execução)
2. Listar os filtros dela    (declarados pelo adapter, não mesclados entre fontes)
3. Executar a busca          (1 fonte + N filtros, com limite por execução)
4. Dedupe                    (Dice >= 0.80 no enunciado + gabarito)
5. Fila PENDING              (admin revisa uma a uma, edita, confirma ou rejeita)
6. APPROVED                  (visível para o aluno)
```

## Diagnóstico (estado atual)

### O que já existe e é reaproveitado

- `Question` e `Exam` em `backend/apps/questions/models.py:5-46`. `Question` tem
  `source_id` (único, `models.py:23`), `discipline`, `banca`, `year`, `statement`,
  `options` (JSON), `correct_answer` (índice 0-based), `explanation` (`models.py:37`)
  e `is_active` (`models.py:38`, `default=True`, indexado) — que hoje é o **único**
  interruptor de visibilidade. **Não existe campo de workflow.**
- `Exam` (`models.py:5-19`) tem `title`, `banca`, `institution`, `role`, `year`,
  `is_published`, **sem** unique constraint e **sem** nível/UF.
- `import_content` (`backend/apps/questions/management/commands/import_content.py`):
  XML (`:95-99`), JSON (`:101-103`), CSV (`:104`); `--dry-run` (`:71`, `:87-88` com
  rollback real); dedupe por `source_id` ou `statement+banca+year` (`:161-166`);
  `update_or_create` (`:172`); preserva explicação curada (`:167-171`); aceita
  `is_active` com **default `True`** (`:183`), ou seja, publica na hora; transação
  única para o arquivo inteiro (`:82-88`).
- `sync_sources` + `apps/concursos/sources/` como padrão de adapter: dataclasses em
  `concursos/sources/base.py:13-55`, fábrica em `concursos/sources/__init__.py:27-70`,
  upsert por `source+external_id` com contador de falha por item em
  `sync_sources.py:100-131`, e `UniqueConstraint(["source","external_id"])` em
  `concursos/models.py:35` — modelo de proveniência a espelhar.
- `ErrorReport` (`models.py:147-162`) é o único modelo do app com `TextChoices` de
  status; é também a "fila" improvisada atual
  (`description="Solicitação de gabarito comentado."`, criada em
  `questions/views.py:422-432`, filtrada em `admin.py:7-19`).
- `ExamSubmission` (`backend/apps/workspace/models.py:59-70`) com `Status`
  `PENDING/REVIEWED` para envio de prova pelo aluno.
- `naming.py` com `normalize_discipline` (`:55-62`), `DISCIPLINE_RENAMES` (`:10-15`)
  e `WORD_FIXES` (`:17-38`) — base para a normalização de banca.
- Frontend: `QuestionContent` renderiza `[[image:...]]`; `StatusBadge`
  (`frontend/components/admin/StatusBadge.tsx:12-27,29-48`); `buildPageList`
  (`frontend/lib/pagination.ts:1-12`); guard de staff em
  `frontend/app/admin/layout.tsx:52-70`; `updateQuestion` já aceita `is_active`
  (`frontend/lib/backoffice.ts:242-243`).

### O que atrapalha

- **A importação publica imediatamente** (`import_content.py:183`).
- **`is_active` é filtrado em 11 pontos** e é `default=True`:
  `questions/views.py:26,47,88,97,176,287,317`, `serializers.py:19`,
  `workspace/views.py:55`, `chat/services.py:44`. Dois pontos **não** filtram:
  `questions/views.py:220` (mapa do simulado) e o M2M de caderno
  (`workspace/models.py:8`).
- **O admin não consegue validar uma questão**: o payload de
  `backoffice/views.py:283-295` não traz `options` nem `correct_answer`, e trunca o
  enunciado em 160 caracteres (`:289`). A aba "Questões sem comentário"
  (`frontend/app/admin/conteudo/page.tsx:250-295`) mostra só metadados e um textarea.
- Fila sem paginação (`qs[:200]` em `views.py:293`, `total` ignorado no frontend).
- `PATCH` de questão (`views.py:302-304`) faz `setattr` sem validar tipo nem tamanho.
- `Question.source_id` é `unique=True` global: duas fontes com o mesmo id colidem.
- Dedupe atual por `statement+banca+year` (`:162-166`) colide entre disciplinas.
- `Question.is_active` tem `default=True`: qualquer `Question.objects.create(...)` fora
  do pipeline (shell, fixture, admin do Django) cria uma questão visível com
  `status=PENDING`, quebrando o invariante `is_active = (status == APPROVED)`. A
  correção definitiva é mudar o `default` para `False` — feita junto à Fase 0.6.
- Nenhum teste do projeto cria `Question(is_active=False)`: **zero cobertura** do
  filtro de visibilidade.
- `requirements.txt` não tem `rapidfuzz`/`numpy` e o banco é SQLite
  (`config/settings/base.py:117-122`) — sem `pg_trgm`. `django-q2` está instalado
  e configurado (`:104-115`) mas **inerte**: não existe `tasks.py`, `Schedule` nem
  processo `qcluster`.
- `frontend/package.json:5-12` não tem script de `test`: não há runner de teste
  no frontend.

## Decisões-chave

| Tema                   | Escolha                                                                     | Motivo                                                                                               |
| ---------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Fontes                 | dataset aberto, API pública, índice oficial, arquivo local                  | Sem scraping de banco comercial (licença e LGPD); o sistema exige `license_name` para ativar a fonte |
| Fonte por execução     | uma única fonte por chamada                                                 | Evita misturar proveniência e torna a busca reproduzível                                             |
| Filtros                | declarados pelo adapter, derivados da fonte escolhida                       | O formulário espelha o que a fonte aceita; trocar de fonte descarta o formulário                     |
| Banca/disciplina       | texto livre normalizado                                                     | Evita refatorar 400+ questões, serializers, filtros e frontend                                       |
| Aprovação              | explicação obrigatória (mín. 120 caracteres)                                | Garante gabarito comentado em toda questão publicada                                                 |
| Rejeição               | motivo obrigatório (texto + código)                                         | Alimenta o relatório de "fonte ruim" e o ajuste do adapter                                           |
| Fila                   | Django admin (ações em massa) **+** `/admin/questoes` (revisão item a item) | Fluxo rápido em lote e curadoria cuidadosa no item                                                   |
| Duplicata              | Dice ≥ 0.80 no enunciado + gabarito igual → não importa                     | Evita repetir enunciado entre fontes e dentro do mesmo arquivo                                       |
| Conflito de gabarito   | ≥ 0.80 com gabarito divergente → PENDING com alerta crítico                 | A banca reusa enunciado com chave diferente; descartar ou publicar sozinho é risco                   |
| Suspeita               | 0.60–0.80 → PENDING com aviso e link                                        | Deixa a decisão para o admin sem bloquear                                                            |
| `status` default       | `PENDING` + backfill das 413 existentes                                     | Nada entra no ar sem passar pela fila                                                                |
| `is_active` default    | Mudar para `False` na Fase 0.6                                              | Impede que `Question.objects.create()` fora do pipeline publique questões `PENDING` silenciosamente  |
| Remoção de `is_active` | Junto com o encerramento da Fase 4                                          | Dois campos de visibilidade concorrentes acumulam bugs; prazo fixo evita virar dívida permanente     |
| Falha na execução      | preserva o importado e marca `partial` com cursor                           | População por partes não pode perder trabalho                                                        |
| Agendamento            | nenhum                                                                      | Comando manual nos dois painéis; sem django-q, cron ou systemd                                       |
| Auditoria              | `SearchRun` único                                                           | Um só histórico de filtros e de importação                                                           |

## [x] Fase 0 — Modelos e migrações

### Modelos novos

| Modelo              | Campos                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuestionSource`    | `slug` (unique), `name`, `kind` (`open_dataset`/`public_api`/`official_index`/`local_file`), `home_url`, `license_name` (obrigatório para `is_active`), `license_url`, `attribution`, `requires_attribution`, `is_active`, `cached_facets` (JSON), `facets_at`, `last_sync_at`, `notes`                                               |
| `SearchRun`         | `name`, `source` FK **não-nula**, `filters` (JSON), `fingerprint` (sha256 de fonte + filtros normalizados, indexado), `status` (`running`/`done`/`partial`/`failed`/`cancelled`), `next_page`, `counts` (JSON), `duplicates_preview` (JSON), `log_path`, `parent` (self FK), `started_by`, `started_at`, `finished_at`, `duration_ms` |
| `QuestionStemToken` | `question` FK, `token`, `df`; guarda os 8 tokens mais raros de cada enunciado                                                                                                                                                                                                                                                         |

`ImportBatch` foi eliminado: `SearchRun` absorve o papel de trilha de importação
(`counts`, `duplicates_preview`, `log_path`, `started_by`). O envio de arquivo do
aluno é uma fonte como as outras (`kind=local_file`, `slug=upload`).

### Alterações

- `Question`: `status = CharField(choices=..., default=PENDING, db_index=True)`,
  `source = FK(QuestionSource, null, SET_NULL, related_name="questions")`,
  `source_id` → **`external_id`** (renomeia, preserva coluna, **remove `unique`**),
  `source_url`, `content_hash` (sha256 de enunciado+alternativas normalizados,
  indexado), `number` (SmallInteger), `reviewed_by`, `reviewed_at`,
  `rejection_reason`, `rejection_reason_code`.
  `UniqueConstraint(["source","external_id"], name="unique_question_source_external")`
  e `Index(["status","-created_at"], name="questions_queue_idx")`.
- `Exam`: `level`, `state` (UF, `max_length=2`) e
  `UniqueConstraint(["title","banca","year"])` — o `update_or_create` do importador
  hoje depende de um uniqueness que não existe no banco.
- `naming.py`: `normalize_banca()`, `BANCAS_ALIASES` (`CESPE`→`CEBRASPE` e afins) e
  filtro de `banca` que aceita o alias, para não quebrar links salvos como
  `?banca=CESPE`.

### Ordem das migrações (crítica — não pode esconder as 413 questões)

1. `AddField` com `default=PENDING`.
2. `RunPython`: cria a `QuestionSource` `legacy`, marca **todas** as questões
   existentes como `APPROVED`, popula `external_id` a partir de `source_id`,
   popula `content_hash` e `QuestionStemToken`.
3. `AlterField` de `external_id` (sem unique) + `AddConstraint` + índices.
4. Migração de dados de `normalize_banca`.

Com `default=PENDING`, os `setUp` de teste que criam `Question` direto passam a
precisar de `status=APPROVED`: `questions/tests.py`, `workspace/tests.py`,
`chat/tests.py`, `studies/tests.py`, `backoffice/tests.py`.

`is_active` **é mantido** e passa a ser derivado de `status` num único ponto
(`moderation.sync_visibility`). Os 11 filtros de leitura não mudam nesta fase.
Removê-lo é fase futura, e fecha os dois vazamentos conhecidos
(`questions/views.py:220` e `workspace/models.py:8`).

### Feito nesta fase

Três arquivos de migração na mesma ordem dos quatro passos acima:
`0010_question_sources_and_status` (schema + rename), `0011_backfill_question_workflow`
(backfill + constraints/índices) e `0012_normalize_question_bancas`.

- `RenameField(source_id → external_id)` roda **antes** do `AddField` da FK
  `source`: a coluna da FK também se chama `source_id` e a ordem invertida quebra
  com `duplicate column name`.
- As 413 questões continuam no ar: 413 `approved`, `source=legacy`, `external_id`
  preservado, `content_hash` e 3211 `QuestionStemToken` preenchidos, `CESPE`
  gravado como `CEBRASPE`.
- `duplicates.normalize_statement()` dobra o acento **antes** de tirar o número da
  questão — o prefixo só casa como `questao 12`, não `Questão 12`.
- `content_hash()` ignora pontuação (ordem das palavras continua valendo), senão
  "Assinale a alternativa." e "assinale a alternativa" caíam em hashes diferentes.
- `BANCAS_ALIASES` também indexa a forma canônica, senão `normalize_banca("cebraspe")`
  devolvia `cebraspe` e a banca entrava duplicada no filtro.
- `test_duplicates.py` cobre normalização, tokens, mínimo de 12 tokens, hash,
  assinatura, Dice, aliases e a unicidade de `external_id` por fonte.

**Pendente para a Fase 1:** os `setUp` que criam `Question` direto ainda não
precisam de `status=APPROVED`, porque a leitura continua filtrando por
`is_active`. Passam a precisar quando `sync_visibility` entrar.

## [x] Fase 0.6 — Fechar o bypass do `backoffice/views.py`

O PATCH em `backoffice/views.py` seta `is_active` com `setattr` direto, sem
derivar de `status`. Isso quebra o invariante `is_active = (status == APPROVED)`
que `moderation.py` garante, podendo colocar questões `PENDING` no ar. Deve ser
corrigido antes da Fase 1, pois a partir daí novas questões começam a entrar na
fila em volume.

### O que muda

- `questions_admin` (PATCH): substitui o `setattr("is_active", ...)` pelo despacho
  a `moderation.approve` / `moderation.reject`. O campo `is_active` sai do payload
  aceito; os campos aceitos passam a ser `explanation`, `rejection_reason` e
  `rejection_reason_code`.
- `questions_admin` (GET): adiciona filtro `?status=` (default `pending`), remove
  o hardcap `qs[:200]` e substitui por paginação com `limit`/`offset`.
- `Question.is_active`: migração altera o `default` de `True` para `False`
  (`0014_question_is_active_default_false`). Não afeta as questões existentes —
  o backfill da Fase 0 já garantiu `is_active=True` para as aprovadas.
- Testes: ao menos um teste verifica que o PATCH aceita apenas os novos campos e
  que `is_active` não pode ser setado diretamente pela rota.

### Não entra nesta fase

O front `/admin/conteudo` continua funcionando (chama o mesmo endpoint), mas
deixa de mandar `is_active` no payload — o front precisa ser ajustado
junto. A aba de revisão completa (`/admin/questoes`) é da Fase 4.

## [x] Fase 0.7 — Testes de regressão de visibilidade (antes da Fase 1)

Mover testes de invariantes de visibilidade para cá, antes que novas questões
comecem a entrar pela pipeline em volume. Um bug nos filtros de `is_active` nas
Fases 1-5 deve ser detectado imediatamente, não na Fase 6.

### Testes obrigatórios nesta fase

- Questão `PENDING` e `REJECTED` são invisíveis em **todos** os endpoints do aluno:
  lista (`/questions/`), `disciplines/`, `facets/`, simulado `start` e `submit`,
  `exam.question_count`, e contexto do chat.
- `approve` sem explicação suficiente → 400; com explicação válida → `is_active=True`
  e `status=APPROVED`.
- `reject` → `is_active=False` e `status=REJECTED`.
- `reopen` → `is_active=False` e `status=PENDING`.
- PATCH direto de `is_active` via `backoffice/views.py` → recusado (após Fase 0.6).
- `Question.objects.create()` sem `is_active` explícito nasce `is_active=False`
  (valida que o `default=False` da migração 0014 está correto).
- Invariante: `sync_visibility` torna `is_active` sempre igual a `(status==APPROVED)`.

Estes testes passam a fazer parte do conjunto de regressão que o CI roda em
cada PR a partir daqui.

### Feito nesta fase

`backend/apps/questions/test_visibility.py` com 35 testes, organizados em 8 classes:

- `DefaultIsActiveTests` — invariante do modelo: `default=False`, `sync_visibility`,
  `approve`/`reject`/`reopen` derivam `is_active` corretamente.
- `QuestionListVisibilityTests` — lista, `disciplines/`, `facets/` e acesso direto
  por `pk` retornam 404 para `PENDING` e `REJECTED`.
- `QuestionActionVisibilityTests` — `answer`, `review`, `note`, `favorite`,
  `comment`, `report` retornam 404 para questão não aprovada.
- `ExamVisibilityTests` — `question_count` e `disciplines` do serializer só contam
  aprovadas; endpoint `/exams/{id}/questions/` idem.
- `SimulationVisibilityTests` — `start` só escolhe aprovadas, pool correto exclui
  pendentes/rejeitadas; `submit` rejeita ids de questões inativas.
- `ChatContextVisibilityTests` — `build_study_context` filtra `is_active=True`.
- `NotebookVisibilityTests` — endpoint de caderno recusa questão inativa (400).
- `BackofficePatchVisibilityTests` — PATCH sem `action` ou com `is_active` direto
  retorna 400; `action=approve/reject` passa pelo `moderation.py`; GET padrão
  filtra `status=pending`, filtro `?status=` funciona, payload inclui enunciado
  e opções completos.

Suíte completa após esta fase: **214 testes verdes**.

## [x] Fase 0.5 — `moderation.py`

Único ponto de escrita do workflow. O PATCH atual
(`backoffice/views.py:302-304`) não pode ser usado para isso.

```
MIN_EXPLANATION_CHARS = 120
REJECTION_REASONS = gabarito errado | enunciado com erro | duplicada
                  | sem gabarito na fonte | licença/direitos | fora do escopo

approve(question, reviewer, explanation=None)
  exige len(explanation.strip()) >= 120  -> ValidationError
  status = APPROVED, is_active = True, reviewed_by, reviewed_at
reject(question, reviewer, reason, reason_code)
  exige reason e reason_code           -> ValidationError
  status = REJECTED, is_active = False
reopen(question, reviewer, note="")
  volta a PENDING (ex.: conteúdo mudou na fonte)
sync_visibility(question)
  is_active = (status == APPROVED)
```

### Feito nesta fase

`backend/apps/questions/moderation.py` com `approve`, `reject`, `reopen` e
`sync_visibility`, mais `test_moderation.py` (18 testes). Suíte completa: 179
testes verdes.

- `approve(question, reviewer, explanation=None)` sem argumento usa a explicação que
  já está no banco — **e exige o mesmo mínimo de 120 caracteres**, senão o caminho
  "aprovar sem reenviar o texto" burlaria a regra.
- `rejection_reason_code` é validado contra `REJECTION_REASONS`; código
  desconhecido é erro, não texto livre.
- Adicionado `Question.review_note` (migração `0013`) porque `reopen` recebe uma
  nota e não havia campo que guardasse o porquê da reabertura.
- Cada ação grava `reviewed_by`/`reviewed_at` e deriva `is_active` do `status`;
  nenhuma delas aceita `status` pronto.

**Ainda burlando o workflow:** o PATCH genérico de
`backoffice/views.py:302-304` continua escrevendo `explanation`/`is_active` direto,
e o form do Django admin ainda aceita os mesmos campos. As actions da fila
(Django + Next) são da Fase 2 e passam a chamar só estas três funções.

## [x] Fase 1 — `ingest/`

Novo pacote `backend/apps/questions/ingest/`, espelhando `apps/concursos/sources/`.

| Módulo          | Responsabilidade                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.py`       | dataclass `QuestionItem` e `FetchResult`                                                                                                                |
| `parsers.py`    | XML/JSON/CSV → `QuestionItem`, reaproveitando `QuestionHTMLParser`, `rich_text` e `without_question_number` de `import_content.py:20-64`                |
| `pipeline.py`   | upsert de `Exam`/`Question` com `transaction.atomic()` **por item**, contadores, preservação da explicação curada e invalidação por mudança de conteúdo |
| `duplicates.py` | normalização do enunciado, Dice, índice de candidatos e o `HashIndex`                                                                                   |
| `__init__.py`   | `run(source, filters, limit, page) -> SearchRun`                                                                                                        |

`import_content` vira wrapper do pipeline, mantendo a CLI atual (arquivo +
`--dry-run`) e passando a criar `SearchRun`. Novo `sync_questions`:
`--source <slug>`, `--filters-json`, `--limit`, `--page`, `--dry-run`.
Vírgula em `--source` resulta em `CommandError("Informe uma fonte por execução.")`.

### Normalização do enunciado (comparação)

1. Remove marcadores `[[image:...]]` — mesma imagem com URL diferente não é texto igual.
2. Remove prefixo de número (`without_question_number()`, `import_content.py:56`).
3. HTML → texto (`rich_text()`).
4. `unidecode` via `django.utils.text` (já vem no Django, sem dependência nova) + minúsculas.
5. Canonicaliza números: `Lei 8.112` ≡ `Lei 8112`, `5º` ≡ `5`.
6. Tokeniza `[a-z0-9]{2,}` e descarta stopwords PT-BR.
7. **Enunciado com menos de 12 tokens não entra na regra de similaridade** — só hash
   exato. Evita que "Julgue o item a seguir" case com qualquer coisa.

### Regra de duplicata

Métrica **Dice** = `2·|A∩B| / (|A|+|B|)` sobre os tokens de conteúdo — é o que
"80% do enunciado bater" significa literalmente. Jaccard fica como constante
alternativa, mais rígida. Threshold em
`QUESTIONS_DUPLICATE_THRESHOLD` (0.80) e banda de suspeita em
`QUESTIONS_SUSPICIOUS_THRESHOLD` (0.60).

| Score            | Gabarito   | Resultado                                                         |
| ---------------- | ---------- | ----------------------------------------------------------------- |
| 1.0 (hash exato) | —          | idempotente: atualiza, não duplica                                |
| ≥ 0.80           | igual      | **não importa** → `duplicate_skipped` + preview + escape hatch    |
| ≥ 0.80           | divergente | PENDING com **alerta crítico** `87% igual a #123, gabarito C ≠ E` |
| 0.60–0.80        | qualquer   | PENDING com aviso e link para a parecida                          |
| < 0.60           | —          | PENDING normal                                                    |

Busca por similaridade contra a base inteira é O(n) por item e inviável para
datasets grandes. Por isso `QuestionStemToken`: candidatos = questões que
compartilham ≥ 3 dos 8 tokens mais raros (consulta indexada), e só candidatos
entram no cálculo de Dice. O índice é montado uma vez por execução e atualizado
incrementalmente, o que também faz a detecção **dentro do próprio arquivo**
funcionar. Comando `rebuild_stem_index` reconstrói; a migração popula para as 413.

Ordem de checagem no pipeline: `(source, external_id)` exato → `content_hash`
exato → similaridade contra candidatos.

### Invalidação

Se o `content_hash` mudar numa questão `APPROVED`, ela volta para `PENDING` e é
despublicada, com registro no log do `SearchRun`. Questão viva nunca é alterada em
silêncio. `import_content.py:167-171` (preservar explicação curada) é mantido.

### Falha no meio

`transaction.atomic()` por item: o que já foi importado permanece, o `SearchRun`
vira `partial` com o motivo e o `next_page`. Só erros de configuração (fonte sem
licença, filtro inválido) abortam antes de começar.

### Feito nesta fase

Pacote `backend/apps/questions/ingest/` completo:

- `base.py` — `QuestionItem`, `FetchResult`, `FilterSpec`, `Option`.
- `parsers.py` — `parse_xml`, `parse_json`, `parse_csv`, `row_item`, `parse_file`;
  reaproveitou `QuestionHTMLParser`, `rich_text` e `without_question_number`;
  aplica `CURATED_XML_EXPLANATIONS` no parse XML.
- `duplicates.py` — `normalize_statement`, `tokenize`, `comparable`, `content_hash`,
  `signature_tokens`, `dice`, `DuplicateMatch`, `HashIndex`, `stem_candidates`,
  `DuplicateChecker` (carrega frequências e `HashIndex` do banco, detecta dentro do
  mesmo arquivo). Bug corrigido: `for question_id, in` → `for question_id in`.
- `pipeline.py` — `ingest_item`, `run_items`, `validate`, `resolve_exam`,
  `find_existing`, `refresh_stem_index`: toda questão nasce `PENDING/is_active=False`;
  questão aprovada com hash alterado volta à fila (invalidação); explicação curada
  é preservada; `transaction.atomic()` por item.
- `__init__.py` — `run(source, filters, limit, page) → SearchRun`,
  `run_file(path) → SearchRun`, `fingerprint`, `legacy_source`.
- `sources.py` — `BaseAdapter`, `LocalFileAdapter`, `OpenDatasetAdapter`,
  `PublicApiAdapter`, `OfficialIndexAdapter`, `get_adapter`, `apply_common_filters`.

Comandos de management:

- `import_content` — wrapper de `run_file`, mantém CLI original, cria `SearchRun`.
- `sync_questions` — `--source`, `--filters-json`, `--limit`, `--page`, `--parent`,
  `--dry-run`; vírgula em `--source` levanta `CommandError`.
- `rebuild_stem_index` — reconstrói `QuestionStemToken` do zero com frequências
  corretas.

Testes: `test_import.py` (normalização, idempotência JSON/XML, curated comments,
`PENDING+is_active=False` verificados); `test_duplicates.py` (normalização, tokens,
Dice, hash, assinatura, aliases de banca, unicidade por fonte).

## [x] Fase 1b — `sources/`

Contrato de filtros — uma declaração por adapter, um formulário para todas as fontes:

```python
@dataclass(frozen=True)
class FilterSpec:
    key: str            # "banca" -> chave no histórico
    label: str          # "Banca"
    kind: str           # select | multiselect | text | int_range | bool | file
    param: str          # nome do param na API / coluna no dataset
    options_from: str   # "facets" | "adapter" | "file"
    multiple: bool = False
    required: bool = False
    help_text: str = ""

class BaseAdapter:
    name: str
    def filters(self) -> list[FilterSpec]: ...
    def list_options(self, spec: FilterSpec, current: dict) -> list[Option]: ...
    def fetch_questions(self, filters: dict, limit: int, page: int) -> FetchResult: ...
```

Resolução por `get_adapter(slug) -> BaseAdapter`. **Desvio consciente do padrão
existente:** `concursos/sources/__init__.py:27-70` usa
`build_adapters(enabled=[...])` com lista; aqui não existe lista, porque uma
execução é de uma fonte só.

### Catálogo de filtros

| Filtro                    | `key`                 | Dataset aberto | API pública    | Índice oficial  | Arquivo local                          |
| ------------------------- | --------------------- | -------------- | -------------- | --------------- | -------------------------------------- |
| Banca                     | `banca`               | coluna/facet   | param          | índice do órgão | valor do arquivo, normalizado          |
| Ano (intervalo)           | `year_from`/`year_to` | facet          | param          | índice          | do arquivo                             |
| Disciplina                | `discipline`          | coluna/facet   | param          | índice          | do arquivo, via `normalize_discipline` |
| Prova                     | `exam`                | coluna         | param          | índice          | `exam_title`                           |
| Cargo                     | `role`                | coluna         | param          | índice          | do arquivo                             |
| Nível                     | `level`               | coluna         | param          | índice          | novo campo em `Exam`                   |
| UF                        | `state`               | coluna         | param          | índice          | novo campo em `Exam`                   |
| Texto livre               | `q`                   | busca          | param de busca | —               | —                                      |
| Só com gabarito comentado | `has_explanation`     | bool           | param          | —               | —                                      |
| Ordenação                 | `ordering`            | criado/ano     | —              | —               | —                                      |
| Página / limite           | `page`/`limit`        | paginação      | paginação      | paginação       | —                                      |
| Arquivo                   | `file`                | —              | —              | —               | upload XML/JSON/CSV                    |

Cada adapter declara só o que suporta. Filtros **dependentes** (as provas só
depois de escolher a banca) re-chamam `list_options(spec, current)`. Opções remotas
ficam em `QuestionSource.cached_facets` com `facets_at`.

Os 4 adapters: `open_dataset` (colunas/facets do dataset), `public_api` (query
params declarados em settings + facets se a API expuser), `official_index`
(valores lidos do índice do órgão), `local_file` (metadados a extrair + upload para
`MEDIA_ROOT/imports/`).

### Critério de pronto (fonte de referência obrigatória)

A Fase 1b só está concluída quando ao menos **um adapter funciona de ponta a ponta
com uma fonte de dados real**, escolhida antes de iniciar a fase. Candidatas:

| Opção                                                        | Adapter        | Justificativa                                                                     |
| ------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| CSV público CEBRASPE (provas disponíveis no site)            | `local_file`   | Sem dependência de API; permite testar parser + pipeline + dedupe com volume real |
| API do QConcursos (endpoint público)                         | `public_api`   | Testa paginação e `FilterSpec` dinâmico                                           |
| Dataset aberto do Banco de Questões ENEM (INEP/dados.gov.br) | `open_dataset` | Licença CC aberta, volume grande, bom para teste de escala do índice de tokens    |

A escolha da fonte de referência deve ser registrada em `QUESTIONS_SOURCES` no
`.env.example` como exemplo funcional, e o teste de integração do adapter
deve passar com os dados reais (ou um subconjunto fixo em fixture).

### Feito nesta fase

- `ingest/sources.py` com `BaseAdapter`, `FilterSpec`/`Option`, `get_adapter(slug)` e os
  4 adapters (`open_dataset`, `public_api`, `official_index`, `local_file`).
- `open_dataset` resolve `path` relativo a `settings.BASE_DIR`, então o mesmo `.env`
  funciona em qualquer máquina.
- **Fonte de referência:** `backend/apps/questions/data/reference_dataset.json` — 9
  questões **sintéticas** em CC0 1.0, versionadas no repositório, com casos que o
  pipeline precisa tratar: duplicata exata (mesmo hash), duplicata por similaridade com
  o mesmo gabarito, conflito de gabarito, enunciado curto demais para a regra de
  similaridade e nome de banca com alias (`CESPE` → `CEBRASPE`). Registrada como
  exemplo funcional em `.env.example` e documentada em `docs/fontes-questoes.md`.
- `test_reference_source.py` (15 testes) cobre a fonte de ponta a ponta: importação,
  deduplicação, alias de banca, contadores do `SearchRun` e a lista de descartadas.
- **Pendente de uma fase futura:** trocar a fixture por conteúdo real licenciado. O
  critério acima é satisfeito pela cláusula "subconjunto fixo em fixture"; nenhuma
  fonte real estava disponível no repositório ou no ambiente, eQUESTões de prova não
  podem ser versionadas aqui sem licença. O fluxo para trocar está em
  `docs/fontes-questoes.md` (seção "Fonte licenciada real").

## [x] Fase 2 — Django admin

- **Página "Busca por fonte"** em 3 passos: fonte → filtros (re-renderiza com
  `?source=<slug>`, sem estado em JS) → executar. `limit` default 200, máximo 1000,
  execução síncrona e limitada (sem worker, sem timeout).
- **Histórico de buscas**: fingerprint, filtros, contadores, `Continuar de onde
parou`, `Executar novamente`, `Importar descartadas`, link para a fila daquela busca.
- `QuestionAdmin`: `actions` de aprovar / rejeitar / reabrir / marcar duplicata
  (primeiras do projeto — hoje `admin.py` não tem nenhuma), `status` e `source` em
  `list_display`/`list_filter`, `reviewed_by`/`reviewed_at`/`content_hash` em
  `readonly_fields`, ordenação da fila: `PENDING` primeiro, depois por
  `comment_requests_count` → `error_count` (aproveita as anotações de `admin.py:29-37`).
- `QuestionSourceAdmin` (exige `license_name` para ativar) e `SearchRunAdmin`
  (read-only) com link para a fila.

### População por partes

```
Busca: banca=CESPE, ano 2020-2023, disciplina=Direito Constitucional, limit=200
 1ª execução  page=1  -> found 812  imported 200  status=partial  next_page=2
 2ª execução  "continuar"           imported 200  status=partial  next_page=3
 ... até status=done
  "Executar novamente" (mesmo fingerprint) -> dedupe descarta o que já entrou
                                            e traz o que a fonte publicou depois
```

### Feito nesta fase

- Página **"Busca por fonte"** em 3 passos (`QuestionSourceAdmin.search_view`):
  fonte → filtros com re-render por `?source=<slug>` (opções dependentes de
  `list_options(spec, current)`) → executar. `limit` default 200, máximo 1000,
  execução síncrona, com `Simular sem gravar`.
- **Histórico de buscas** (`SearchRunAdmin.history_view`): fingerprint, filtros,
  contadores, log, `Continuar de onde parou`, `Executar novamente`,
  `Importar descartadas` e link para a fila daquela busca.
- `QuestionAdmin` com as 4 ações em massa — aprovar, rejeitar, reabrir e marcar
  duplicada — todas passando por `moderation.py` através de um `_bulk_action` comum:
  um item que viola a regra não interrompe o lote, ele é contado e o motivo vai
  para o aviso do admin.
- Ordenação da fila em `apps/questions/queue.py` (`annotate_queue_priority` +
  `QUEUE_PRIORITY_ORDER`): `status_order` (`PENDING` → `REJECTED` → `APPROVED`),
  `-comment_requests_count`, `-error_count`, `id`. Fica num módulo próprio porque o
  admin e a API de conteúdo precisam mostrar a fila na mesma ordem.
- `QuestionSourceAdmin` recusa ativar uma fonte sem `license_name`
  (`save_model`), e `_error_text` transforma o `ValidationError` de filtro em uma
  frase legível em vez do dict cru.
- `SearchRun.limit` (migração `0016`) passa a ser gravado: sem ele, continuar/repetir
  uma execução reaplicava o default do adapter e o cursor não era reproduzível.
- `test_admin_queue.py` (15 testes) cobre a ordem da fila, as 4 ações em massa
  (inclusive o item ignorado por falta de explicação), a recusa da fonte sem licença,
  a página de busca com simulação, o erro de filtro obrigatório e os links do
  histórico.


## [x] Fase 3 — API

Prefixo `content/`, permissão `IsAdminUser` (já padrão do app em
`backoffice/views.py:269-271`).

| Rota                                                | O que faz                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET content/sources/`                              | fontes ativas (slug, label, kind, licença, última execução)                               |
| `GET content/sources/<slug>/filters/`               | `FilterSpec[]` + opções do estado atual                                                   |
| `POST content/question-search/`                     | `{source, filters, limit}` → executa e devolve o `SearchRun`; `source` como lista → `400` |
| `GET content/question-search/`                      | histórico paginado, agrupável por fingerprint                                             |
| `GET content/question-search/<id>/`                 | detalhe, contadores, cursor, log                                                          |
| `POST content/question-search/<id>/continue/`       | próxima parte a partir do cursor                                                          |
| `POST content/question-search/<id>/rerun/`          | replay dos mesmos filtros (preenche lacunas)                                              |
| `POST content/question-search/<id>/import-skipped/` | importa as descartadas                                                                    |
| `GET content/questions/queue/`                      | fila paginada, filtros e prioridade                                                       |
| `GET content/questions/queue/next/`                 | próxima a revisar (`?search_run=`, `?cursor=`)                                            |
| `POST content/questions/approve/`                   | confirmação item a item e em lote                                                         |
| `POST content/questions/reject/`                    | exige motivo                                                                              |

O payload de revisão traz enunciado **inteiro**, `options`, `correct_answer`,
procedência (fonte, `source_url`, licença, `external_id`, hash), `duplicates[]` e
`conflict`. Os dicts montados à mão (`views.py:283-295`) viram serializers DRF.

### Feito nesta fase

- Rotas administrativas em `backoffice/question_content_api.py`: fontes ativas, filtros
  declarados pelo adapter, execução/histórico/detalhe de `SearchRun`, continuar,
  reexecutar e reprocessar duplicatas descartadas.
- Fila paginada e FIFO por `SearchRun`, com payload completo de revisão e ações de
  aprovar/rejeitar delegadas a `moderation.py`. A lista ordena pela **mesma**
  prioridade do admin (`apps/questions/queue.py`); `next/` permanece FIFO por `id`
  para o cursor `?cursor=` fazer sentido.
- Payload de revisão: enunciado inteiro, `options`, `correct_answer`, procedência
  (fonte com licença, `source_url`, `external_id`, `content_hash`) e **`duplicates[]`**
  com score e `answer_conflict`, mais o booleano **`conflict`**. Vem de
  `DuplicateChecker.matches()` — a mesma comparação do pipeline, sem gravar nada.
  `content_hash` cai no hash calculado quando a questão foi criada fora do ingestor.
- `Question.search_run` (migração `0015`) relaciona cada questão nova ou atualizada
  à execução que a trouxe; isso torna os filtros e o cursor da fila reproduzíveis.
- `SearchRun.limit` (migração `0016`) é gravado e reaproveitado em
  continuar/reexecutar/importar descartadas.
- `test_question_content_api.py` (13 testes) cobre fontes ativas, fila por execução,
  prioridade da fila, procedência e duplicatas, conflito de gabarito, enunciado curto
  sem duplicatas, aprovação com e sem comentário, rejeição sem motivo, decisão em
  lote, `404` e as 11 rotas fechadas (`403`) para usuário não staff.


## [x] Fase 4 — Next `/admin/questoes`

Duas colunas em `max-w-none` (o shell limita a `max-w-6xl` em
`layout.tsx:193`), com a lista recolhível para foco total:

- **Esquerda:** lista compacta com filtros por fonte, busca (`SearchRun`), status,
  banca, disciplina, ano, duplicatas e conflitos.
- **Direita:** uma questão por vez, na ordem do `id` dentro do `SearchRun` (FIFO),
  com `12 de 340 nesta busca · 74% concluído`. Enunciado via `<QuestionContent>`
  (imagens incluídas), alternativas com a correta destacada, gabarito em letra,
  caixa de procedência, `duplicates[]` com score e link, `Textarea` com contador de
  120 e botões **Aprovar** / **Rejeitar** / **Pular**. Atalhos: `A` aprovar,
  `R` rejeitar, `S` salvar rascunho, `P` pular, `J`/`K` navegar. Após aprovar,
  avança sem refetch; contadores em background.
- Botão **"Buscar questões"** abre `Dialog` de 2 passos (fonte → filtros), alimentado
  por `GET content/sources/<slug>/filters/`.
- `StatusBadge` (`StatusBadge.tsx:12-27,29-48`) mapeia `approved`/`pending`/`rejected`.
- Atribuição exibida ao aluno quando `requires_attribution`.
- A aba "Questões sem comentário" (`conteudo/page.tsx:250-295`) vira link para cá,
  para não manter duas interfaces de revisão divergentes.
- Trocar a fonte no `Dialog` **descarta** o formulário: `banca` na fonte A e `banca`
  na fonte B podem significar coisas diferentes.

### Estados de erro da UI (especificados antes dos atalhos de teclado)

| Situação                                            | Comportamento                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `approve` → 400 (explicação curta demais)           | Toast de erro com contagem de caracteres atual vs. 120 mínimo; caixa de texto recebe foco e borda vermelha; questão **não** avança |
| `approve` → 400 (outro motivo de validação)         | Toast com a mensagem da API; estado da questão não muda                                                                            |
| `reject` → 400 (motivo/código ausente)              | Campos de motivo recebem indicador de erro; questão não avança                                                                     |
| Erro de rede (timeout, 5xx)                         | Toast "Falha ao salvar — tente novamente"; botões reabilitados; questão não avança                                                 |
| Questão modificada por outro admin entre GET e POST | API retorna 409 com `detail`; UI recarrega a questão atual e exibe aviso "Esta questão foi atualizada por outro revisor"           |
| Questão já aprovada/rejeitada (ação redundante)     | API retorna 409; UI remove a questão da fila local e avança para a próxima                                                         |
| Fila vazia                                          | Tela de "Fila em dia" com link para iniciar nova busca via `Dialog`                                                                |
| `SearchRun` não encontrado ou sem permissão         | 404 com redirecionamento para o histórico de buscas                                                                                |

Atalhos de teclado (`A` aprovar, `R` rejeitar, `S` salvar rascunho, `P` pular,
`J`/`K` navegar) só são ativados quando não há foco em campo de texto, para
não interferir com a digitação da explicação.

### Feito nesta fase

- Tela `frontend/app/admin/questoes/page.tsx` em duas colunas, com a lista recolhível
  (`max-w-none` só nessa rota, via `cn()` no `app/admin/layout.tsx`, porque o shell
  limita tudo a `max-w-6xl`).
- **Esquerda:** `QueueList` com filtros por fonte, `SearchRun`, status, banca,
  disciplina, ano, busca textual, "só duplicatas" e "só conflitos". Trocar a fonte
  descarta a `SearchRun` selecionada: uma execução pertence a uma fonte só.
- **Direita:** `ReviewPanel` com `QuestionContent` (imagens incluídas), alternativas e
  gabarito em letra, procedência (fonte, licença, `external_id`, link de origem),
  `duplicates[]` com score e link, `Textarea` de 120 com contador e as ações
  Aprovar/Rejeitar/Pular. Aprovar atualiza a fila **sem refetch**; só os contadores
  do cabeçalho (`12 de 340 nesta busca · 74% concluído`) vêm da API.
- `SearchDialog` em dois passos (fonte → filtros declarados por ela). Trocar a fonte
  descarta o formulário inteiro, porque `banca` na fonte A e `banca` na fonte B não
  significam a mesma coisa.
- Atalhos `A` aprovar, `R` focar os motivos de rejeição, `S` salvar rascunho, `P`
  pular, `J`/`K` navegar — desligados quando o foco está em `input`, `textarea`,
  `select` ou `contentEditable`. **`R` não rejeita sozinho:** um `R` acidental não pode
  descartar a questão, então ele foca a lista de motivos.
- `StatusBadge` mapeia `approved`/`pending`/`rejected`; a aba "Questões sem comentário"
  do `app/admin/conteudo` virou link para cá (duas telas de revisão divergem).
- **Estados de erro**, um a um: `400` de explicação → foco no campo, borda vermelha e
  contagem `atual/120`; `400` de rejeição → anel vermelho no bloco de motivos; erro de
  rede/5xx → aviso "Falha ao salvar — tente novamente" e botões reabilitados;
  `409` de questão já revisada → remove da fila local e avança; `409` de questão
  alterada por outro revisor → recarrega e avisa; fila vazia → "Fila em dia" com botão
  para o `Dialog`; `SearchRun` inexistente → avisa e volta ao histórico.
- **Fim da dívida do `is_active`:** campo removido do modelo com a migração `0017`
  (backfill do que estava `is_active=True` para `approved` antes do `RemoveField`),
  `moderation.sync_visibility` deletado, os 11 pontos de leitura convertidos e os 2
  vazamentos fechados. `visible()` em `apps/questions/visibility.py` é a única forma
  de ler questão para o aluno; `QuestionSource.is_active` continua, porque é outra
  coisa (a fonte pode ser desativada sem sumir com as questões importadas).
- API acrescentada para a tela, com `IsAdminUser` e testes:
  - `GET content/questions/rejection-reasons/` — os motivos estruturados saem de
    `moderation.REJECTION_REASONS`, não de uma lista copiada no frontend.
  - `POST content/questions/draft/` — `S` grava `review_note` sem aprovar nem
    reprovar, para o revisor não perder o raciocínio ao trocar de questão.
  - `updated_at` no payload e **bloqueio otimista**: `approve`/`reject` devolvem `409`
    com `code: "stale"` se a questão mudou entre o GET e o POST, e
    `code: "already_reviewed"` se alguém já decidiu. A UI ramifica pelo `code`, não
    pelo texto.
  - `duplicates=1` e `conflict=1` na fila, com varredura limitada a 300 questões do
    topo (`DUPLICATE_SCAN_LIMIT`) — não existe coluna para isso, a comparação é a do
    `DuplicateChecker`, uma consulta por questão. Acima disso, o recorte é o filtro
    de `SearchRun`.
  - Dentro de uma `SearchRun` a fila é FIFO por `id`; sem `search_run`, vale a
    prioridade compartilhada com o admin.
  - `GET question-search/<id>/` traz `reviewed_count`, que alimenta o "74% concluído".
- Atribuição: `QuestionSerializer` devolve `attribution` (vazio quando a fonte não
  exige crédito) e `source_url`, e a tela do aluno mostra o crédito com link. Três
  testes em `test_visibility.py`.
- `test_question_content_api.py` com 20 testes e `test_visibility.py` com 39; suíte
  completa em 268 testes verdes, `make check`, `make lint` (0 erros), `make typecheck`
  e `make build` (`/admin/questoes` prerenderizada) passando.
- Corrigido de passagem: `components/ui/checkbox.tsx` tinha `forwardRef` sem tipos e
  quebrava `make typecheck`; e o `Toast` virou `Notice` porque `sonner` não está no
  `package.json` (o projeto usa o par `Notice`/`setError` do `app/admin/conteudo`).


## [x] Fase 5 — Envio de aluno

`ExamSubmission` (`workspace/models.py:59-70`) ganha `rights_confirmed` (obrigatório
no upload) e `source` da fonte `local_file`. Ao marcar a prova como revisada, a ação
**"Converter em questões"** abre formulário para colar XML/JSON ou enviar arquivo →
mesmo `ingest.pipeline` → PENDING com procedência "enviado por {usuário}" e sem
`source_url` público. O PATCH de status existente (`backoffice/views.py:255-266`)
permanece.

### Feito nesta fase

- `ExamSubmission` ganhou `rights_confirmed`, `source`, `converted_run`, `converted_at` e
  `converted_questions` (migration `workspace/0004_examsubmission_conversion.py`).
- Envio do aluno (`workspace/views.py`) passou a exigir `rights_confirmed`; o
  `JSONParser` que faltava no parser class-based também foi adicionado, o que
  conserta o `415` que o link já devolvia. O `GET` expõe os campos de conversão.
- Conversão em `apps/questions/submissions.py`: `QuestionSource` própria por envio
  (`is_active=False`, `attribution="Enviado por {username}"`), `source_url` removido
  dos itens, `external_id="envio{id}:{n}"` para reconversão idempotente. Só roda com
  `status=REVIEWED` e direitos confirmados, aceita dry-run e 2 MB de conteúdo colado
  ou arquivo.
- `POST /api/backoffice/content/proofs/convert/` (`IsAdminUser`) e o GET das provas
  passou a devolver arquivo, descrição, direitos e o progresso da conversão.
- `parse_content` + `parse_xml_text`/`parse_json_text`/`parse_csv_text` em
  `ingest/parsers.py` para o texto colado no dialog; `run_items_record` foi extraído
  em `ingest/__init__.py` para o upload e a conversão compartilharem criação de
  `SearchRun` e `_finish`.
- Frontend: checkbox obrigatório de direitos no envio (bloqueia o botão e some após
  o sucesso) com o progresso de questões na lista, e o Dialog "Converter em
  questões" na aba de provas, só para as revisadas, com dry-run e confirmação de
  direitos para os envios antigos.
- `make check`, `make test` (294 testes), `make lint` (0 erros), `make typecheck` e
  `make build` passando.

## [ ] Fase 6 — Testes e documentação

Backend (`test_moderation.py` novo + ajustes nos existentes):

- Questão `PENDING` invisível em **todos** os endpoints do aluno — lista, `facets/`,
  `disciplines/`, simulado (start/submit), `exam.question_count`, caderno, contexto
  do chat. Hoje não existe nenhum teste de `is_active=False`.
- Aprovar sem explicação → 400; com → `APPROVED` + `is_active` + `reviewed_by`.
- Lote parcial, rejeitar sem motivo → 400, reabrir.
- Não-staff → 403 em todas as rotas novas.
- Dedupe: hash exato; 82% duplicata; 79% suspeita; 82% com gabarito divergente vira
  conflito; enunciado curto não casa; duplicata **dentro do mesmo arquivo**;
  reimportação não conflita consigo mesma.
- Invalidação: atualizar enunciado de questão aprovada → volta a PENDING.
- `CESPE` → `CEBRASPE` e o filtro aceita o alias.
- Backfill: questões pré-existentes saem `APPROVED`.
- Busca: `partial` com cursor, `continue` avança página, `rerun` não duplica,
  `import-skipped`, `queue/next` FIFO por `SearchRun`.
- Um teste por adapter: todo filtro declarado vira campo de formulário e toda opção
  é buscada da fonte certa.

Frontend não tem runner (`package.json:5-12`): validação por `tsc` + `npm run build`

- checklist manual. CI já roda `manage.py test --noinput`
  (`.github/workflows/ci.yml:22`).

Docs: `docs/requisitos.md`, `readme.md` (comandos e o porquê de não agendar nada) e
`.env.example` (`QUESTIONS_SOURCES`, thresholds de duplicata).

## Ordem de execução

| #   | Fase | Entrega                                                                                                                                                                   |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0    | `QuestionSource`, `SearchRun`, `QuestionStemToken`, campos em `Question`/`Exam` + 4 migrações + backfill das 413                                                          |
| 2   | 0.5  | `moderation.py` + testes do serviço                                                                                                                                       |
| 3   | 0.6  | Fechar bypass do `backoffice/views.py`: PATCH via `moderation.*`, paginação no GET, migração `default=False` em `is_active`                                               |
| 4   | 0.7  | Testes de regressão de visibilidade: invariante `is_active/status`, questão `PENDING` invisível em todos os endpoints do aluno                                            |
| 5   | 1    | `ingest/` + `duplicates.py` + `sync_questions` + `import_content` delegando                                                                                               |
| 6   | 1b   | `sources/` com `FilterSpec`, `get_adapter` e os 4 adapters + fonte de referência real + cache de facets                                                                   |
| 7   | 3    | API de fontes, filtros, busca e histórico + serializers da fila                                                                                                           |
| 8   | 2    | Django admin: página de busca, histórico, ações em massa, "importar descartadas"                                                                                          |
| 9   | 4    | Next: `/admin/questoes` como fluxo sequencial + estados de erro + `Dialog` de busca + `StatusBadge`; **remover `is_active` e fechar os 2 vazamentos ao final desta fase** |
| 10  | 5    | Envio de aluno → conversão pela mesma pipeline                                                                                                                            |
| 11  | 6    | Testes finais + docs                                                                                                                                                      |

## Riscos residuais

1. **Quase-duplicata por similaridade** roda em Python (SQLite sem `pg_trgm`). Escala
   até ~50 mil questões; acima disso, avaliar FTS5 do SQLite ou migrar para Postgres.
2. **Curadoria das fontes oficiais** não traz gabarito comentado na origem, então a
   explicação obrigatória vira o gargalo. Atalho possível: gabarito-base por
   disciplina para o admin editar.
3. **Falso positivo de duplicata** com enunciados curtos genéricos — mitigado pelo
   piso de 12 tokens; a banda 0.60–0.80 existe para o admin discordar.
4. ~~**`is_active` e `status` convivem**~~ — **resolvido na Fase 4.** `Question.is_active`
   foi removido (migração `0017`, com backfill do que estava visível para
   `approved`). A regra é `status=APPROVED` em todo leitor, concentrada em
   `apps/questions/visibility.py`, e os 2 vazamentos conhecidos foram fechados
   (consulta de questões de simulado e M2M de caderno, que agora passa pelo filtro
   em `workspace/views.py`).
5. **A validação de licença é do time/jurídico.** O sistema registra e exige
   `license_name` para ativar a fonte e exibe a atribuição; ele não decide se um
   dataset pode ser redistribuído.
6. **Execução síncrona no admin** depende do `limit` (default 200) para não estourar
   timeout. Para lotes grandes, o caminho é o CLI `sync_questions`. O Django-Q2 está
   instalado e configurado com Redis (2 workers, timeout 90s), então a migração para
   execução assíncrona é de baixo custo quando necessário. **Decisão explícita:**
   manter execução síncrona enquanto `limit ≤ 500` (threshold que cabe em ~30s
   medido localmente com SQLite). Se a interface de busca passar a precisar de lotes
   maiores, a Fase 2 ou Fase 3 deve enfileirar via Django-Q e fazer o frontend
   fazer polling em `SearchRun.status` — a infraestrutura já existe, só falta o
   `tasks.py`. O timeout do gunicorn/nginx deve ser configurado para 60s no mínimo
   para não silenciar falhas de lote no limite.
