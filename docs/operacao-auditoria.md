# Operação da auditoria

## Retenção

A retenção padrão é de 365 dias e é configurada por `AUDIT_RETENTION_DAYS`. O comando nunca remove dados sem confirmação:

```bash
cd backend
.venv/bin/python manage.py purge_audit_events
.venv/bin/python manage.py purge_audit_events --confirm
```

Agende a execução diária no worker/cron da infraestrutura. O comando exige no mínimo 30 dias de retenção e registra a própria execução como `audit.retention.purged`, com corte, prazo e quantidade removida. Execute primeiro sem `--confirm` em produção e mantenha backup antes da primeira limpeza.

## Acesso

Consulta e exportação da auditoria completa exigem superusuário ativo com acesso
staff. Pertencer ao grupo Administrador não concede esse acesso.

## Exportações

A exportação de auditoria é somente CSV, não inclui snapshots JSON e é limitada por `AUDIT_EXPORT_MAX_ROWS` (padrão: 1000). Cada visualização e exportação é registrada na própria trilha de auditoria.

## Relatórios financeiros

A visualização financeira requer superusuário ou papel Administrador com a permissão `backoffice.view_financial_reports`. A exportação registra `report.exported`. A etapa 6 calcula receita pelos recibos BRL normalizados e indica registros excluídos, sem estimar valores legados pelo catálogo. Definições, limites e validação operacional em [operação de relatórios](operacao-relatorios.md).


## Cobertura de comandos e serviços

Os comandos `import_content`, `sync_questions`, `sync_sources`, `backup_db`,
`restore_db`, `publish_scheduled_news`, `publish_scheduled_notifications` e
`purge_audit_events` registram eventos `command.<nome>.started`, `.completed` ou
`.failed`. Falha registra apenas a classe do erro; argumentos, conteúdo de arquivos,
filtros de fontes e mensagem da exceção não são copiados para a auditoria.

Eventos de sistema têm ator nulo e `context.origin` identificando comando/job.
`context.operation_id` correlaciona uma execução; operações internas possuem
`parent_operation_id`. Chamadas HTTP preservam o ator, IP, user-agent redigido e
`X-Request-ID` quando ele é um UUID válido. O contexto é isolado por execução.

- `question_import.completed`, `.partial` e `.failed`: resumo por `SearchRun`, com
  contadores e indicação de simulação. `--dry-run` grava apenas os metadados de
  execução/auditoria já previstos, sem criar/alterar questões.
- `question.import_created`, `.import_updated` e `.reopened`: alterações da ingestão,
  identificadas pela origem e execução; enunciados e filtros não são copiados.
- `question.approved`, `.rejected` e `.reopened`: moderação com ator, motivo e
  snapshots da revisão. O serviço grava mudança e evento na mesma transação,
  inclusive quando chamado pelo Admin Django ou diretamente.
- `backup.created` e `backup.restored`: eventos dos serviços, preservados para
  chamadas via API, CLI ou código. Há também eventos de início/conclusão/falha.
- `article.published`, `notification.published`, `notification.expired` e
  `notification.recipients_materialized`: publicação/materialização em segundo plano.
  Repetir o job não duplica o evento de uma transição já concluída.

Os jobs também registram ciclo de execução e falha. Um evento `.completed` de
comando/job confirma o retorno normal da rotina; os resumos de domínio devem ser
consultados para distinguir processamento parcial e itens com erro.

A retenção só exclui registros com `--confirm`; exclusão e evento de retenção
compartilham a transação. Uma falha em gravar auditoria de transição impede o commit
da mudança. Se o banco estiver indisponível ao registrar uma falha, a exceção original
é preservada e o logger informa a impossibilidade de persistir o evento.

## Comparação e redação

O detalhe apresenta os campos adicionados, removidos e alterados, incluindo caminhos
aninhados. Valores ausentes, nulos e texto vazio aparecem de forma distinta. Listas
são comparadas como valores completos. Campos sem mudança não aparecem no diff.
Snapshots e contexto permanecem acessíveis em uma seção expansível.

A redação recursiva cobre chaves sensíveis e padrões usuais de credenciais em texto.
Ela ocorre antes da persistência e novamente na consulta de registros legados.
Segredos com nomes/padrões desconhecidos não são detectáveis automaticamente;
novos emissores devem continuar usando payloads mínimos e campos explicitamente permitidos.

## Backup e restauração

A auditoria reside no mesmo banco da aplicação: restaurar esse banco pode remover
os eventos posteriores ao backup, inclusive o início da própria restauração. O
serviço registra o resultado após restaurar; isso não substitui uma trilha externa.
Antes de restaurações operacionais, preserve/exporte a auditoria em armazenamento
independente com acesso restrito. Não confunda imutabilidade pela aplicação com
proteção contra rollback ou acesso direto ao banco.

O serviço atual de backup continua sendo SQLite. O ajuste de compatibilidade de
extração para Python sem `tarfile.data_filter` aceita somente arquivos regulares e
diretórios dentro do destino temporário, rejeitando links e travessia de caminhos.
Isso não adiciona suporte a PostgreSQL, que permanece em etapa posterior.
