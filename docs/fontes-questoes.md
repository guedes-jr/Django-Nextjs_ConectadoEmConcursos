# Fontes do banco de questões

Antes de ativar uma `QuestionSource`, registre e aprove a licença de uso e redistribuição. A plataforma exige `license_name` para executar uma fonte, mas essa validação técnica não substitui a análise jurídica.

## Fonte de referência local

A referência operacional da Fase 1b é o adapter `open_dataset` com um CSV ou JSON local licenciado. Ele permite validar parser, filtros, paginação, deduplicação e fila sem raspar sites ou depender de APIs de terceiros.

1. Copie `.env.example` para o seu ambiente e ajuste `QUESTIONS_SOURCES` com o `slug`, caminho e mapeamento do arquivo licenciado.
2. No Django admin, crie uma `QuestionSource` com o mesmo `slug`, tipo **Dataset aberto**, nome, URL de origem e licença aprovada.
3. Execute uma simulação sem escrita:

```bash
cd backend
.venv/bin/python manage.py sync_questions --source dataset-licenciado --dry-run --limit 20
```

4. Revise o `SearchRun` criado. Só então execute sem `--dry-run`.

Cada execução aceita uma única fonte. Filtros disponíveis são declarados pelo adapter e não devem ser misturados entre fontes.
