# Fontes do banco de questões

Antes de ativar uma `QuestionSource`, registre e aprove a licença de uso e redistribuição. O admin recusa ativar uma fonte sem `license_name`, mas essa validação técnica não substitui a análise jurídica.

## Fonte de referência local

A referência operacional da Fase 1b é o adapter `open_dataset` com um CSV ou JSON local. Ele permite validar parser, filtros, paginação, deduplicação e fila sem raspar sites ou depender de APIs de terceiros.

O repositório já traz um dataset de referência em `backend/apps/questions/data/reference_dataset.json`: são 9 questões **sintéticas** (CC0 1.0), escritas para exercitar o pipeline — duplicata exata, duplicata por similaridade com o mesmo gabarito, conflito de gabarito, enunciado curto e nome de banca com alias (`CESPE` → `CEBRASPE`). Ele não é conteúdo de prova e não serve para treinar o modelo de similaridade com dados reais; serve para provar que a mecânica funciona.

1. Copie `.env.example` para o seu ambiente. O arquivo de exemplo já vem com:

```bash
QUESTIONS_SOURCES={"referencia":{"path":"apps/questions/data/reference_dataset.json"}}
```

2. No Django admin, crie uma `QuestionSource` com o mesmo `slug` (`referencia`), tipo **Dataset aberto**, nome e licença aprovada.
3. Execute uma simulação sem escrita:

```bash
cd backend
.venv/bin/python manage.py sync_questions --source referencia --dry-run --limit 20
```

4. Revise o `SearchRun` criado. Só então execute sem `--dry-run`.

O caminho do dataset é resolvido a partir de `settings.BASE_DIR` quando é relativo, então o mesmo `.env` funciona em qualquer máquina.

### Fonte licenciada real

Ao trocar por conteúdo real, mantenha o `slug`, aponte o `path` para o arquivo e declare o `mapping` quando os nomes das colunas não forem os canônicos (`id`, `question`, `answers`, `answer_index`, `board`, `subject`, `exam`):

```bash
QUESTIONS_SOURCES={"dataset-licenciado":{"path":"/caminho/para/questoes-licenciadas.csv","mapping":{"id":"external_id","question":"statement","answers":"options","answer_index":"correct_answer","board":"banca","subject":"discipline","exam":"exam_title"}}}
```

Cada execução aceita uma única fonte. Filtros disponíveis são declarados pelo adapter e não devem ser misturados entre fontes.
