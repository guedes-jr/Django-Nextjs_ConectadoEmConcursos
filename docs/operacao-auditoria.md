# Operação da auditoria

## Retenção

A retenção padrão é de 365 dias e é configurada por `AUDIT_RETENTION_DAYS`. O comando nunca remove dados sem confirmação:

```bash
cd backend
.venv/bin/python manage.py purge_audit_events
.venv/bin/python manage.py purge_audit_events --confirm
```

Agende a execução diária no worker/cron da infraestrutura. O comando exige no mínimo 30 dias de retenção e registra a própria execução como `audit.retention.purged`, com corte, prazo e quantidade removida. Execute primeiro sem `--confirm` em produção e mantenha backup antes da primeira limpeza.

## Exportações

A exportação de auditoria é somente CSV, não inclui snapshots JSON e é limitada por `AUDIT_EXPORT_MAX_ROWS` (padrão: 1000). Cada visualização e exportação é registrada na própria trilha de auditoria.

## Relatórios financeiros

A visualização financeira requer superusuário ou a permissão `backoffice.view_financial_reports`. A exportação registra `report.exported`. Valores recebidos não são calculados até o provedor persistir um valor monetário normalizado em cada `PaymentEvent`; o painel informa essa indisponibilidade em vez de estimar receita com preço atual do plano.
