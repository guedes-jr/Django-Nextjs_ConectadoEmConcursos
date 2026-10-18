# Relatórios financeiros — etapa 6

O painel `/admin/relatorios/negocio` consulta
`GET /api/backoffice/reports/business/`. Os cálculos ficam em
`backend/apps/backoffice/financial_reports.py`; o frontend só formata os valores.

## Período, acesso e exportação

- Atalhos de 7/30/90 dias ou `since`/`until`, até 365 dias. Intervalo fechado no
  início e aberto no fim: `[since, until)`. Datas sem horário usam meia-noite no
  fuso Django (`America/Sao_Paulo` por padrão); o fim informado é exclusivo.
  Datas inválidas, futuras, invertidas ou fora dos limites retornam 400.
- O período anterior é adjacente e tem a mesma duração. O agrupamento diário usa o
  fuso informado no retorno. `paid_at`, e não a chegada do webhook, determina em
  qual período entra o recebimento.
- MRR, ARR, distribuição de assinaturas, fila e risco são fotografias atuais,
  identificadas por data/hora. Não representam reconstrução histórica da carteira.
- O financeiro exige superusuário ou papel Administrador com permissão
  `backoffice.view_financial_reports`. Staff sem esse acesso continua vendo os
  demais indicadores, mas não valores, tickets ou agrupamentos financeiros.
- JSON e CSV usam `Cache-Control: no-store`. Visualização/exportação são auditadas,
  com período e autorização; não se copia o relatório financeiro para a auditoria.
- O CSV usa o mesmo período absoluto exibido na tela, inclui definições, cobertura,
  valores e agrupamentos. Uma nova consulta pode incorporar um webhook atrasado e
  renovar as fotografias atuais. Nomes iniciados por fórmulas são neutralizados.
- Agrupamentos de plano/ciclo e distribuição têm limite de 200 linhas e sinalizam
  truncamento. Totais sempre incluem todos os recibos elegíveis. A série diária
  fica limitada pela janela máxima de 365 dias.

## Definições financeiras

**Receita confirmada registrada:** soma em centavos dos eventos processados
`payment.succeeded` e `subscription.renewed`, com fatura, `amount_minor`, `paid_at`
e moeda `brl`. O recibo único por fatura evita contar notificações duplicadas.
Não é receita líquida: taxas, impostos, estornos e chargebacks não são deduzidos,
pois essas fontes ainda não foram integradas.

**Cobertura:** registros pagos com campos incompletos, outra moeda ou sem confirmação
são contados como exclusões. Quando a data de pagamento falta, a data de registro
serve somente para posicionar a exclusão; não se estima quando o dinheiro entrou.
`recorded` indica cobertura dos recibos locais registrados; não comprova entrega de
todos os eventos do provedor. `partial` mostra a soma conhecida e as exclusões;
`unavailable` retorna receita nula quando há apenas registros excluídos. Um período
sem registros retorna 0,00, sem afirmar que a conta externa foi reconciliada.
Recibo válido de zero reais continua sendo contado como confirmação de fatura.

**Comparação:** variação percentual somente quando ambos os períodos não possuem
exclusões e a receita anterior é diferente de zero. Nos demais casos, exibe “—”.
Ticket médio recebido é a soma conhecida dividida pelo número de recibos incluídos.
Cálculos monetários usam Decimal e arredondamento de meio para cima em centavos.

**MRR:** somente assinaturas Stripe com preço contratado positivo em BRL,
status local ativo, status remoto ativo, período pago vigente e renovação habilitada.
Usa `price_amount_minor` dividido pelo número de meses do ciclo (1, 6 ou 12).
Não usa o preço atual do catálogo. Atrasos, cancelamentos agendados, concessões locais,
assinaturas vencidas ou sem preço confirmado ficam fora do MRR. ARR multiplica o
MRR não arredondado por 12; por isso pode diferir alguns centavos do MRR exibido × 12.

**Assinaturas pagas vigentes:** incluem cancelamentos agendados e atrasos que ainda
têm período pago válido. Novas contratações e renovações são contadas por fatura
confirmada. Falhas/cancelamentos processados usam a data no provedor, com fallback
para registro. Renovação não é contabilizada como reativação.

**Atribuição histórica:** novos recibos guardam slug, nome e ciclo no momento da
confirmação. Alterar o catálogo ou a assinatura não reclassifica esses recebimentos.
Recibos antigos sem snapshot permanecem em “Não identificado”; a migração não
preenche dados por associação à assinatura atual, pois ela pode ter sido trocada.

As contagens operacionais incluem eventos processados legados e de outras moedas,
com fallback de data, e podem diferir do número de recibos financeiros completos BRL.
Conversão cadastro → assinatura ativa verifica acesso vigente agora, incluindo plano
gratuito; não equivale à conversão histórica para assinatura paga.

## Migração e validação operacional

Aplicar `billing.0006` após `billing.0005`. Adiciona snapshots de plano/ciclo e índice
para consultas de pagamentos; preserva valores legados desconhecidos. A migração
foi validada apenas em banco temporário nesta etapa.

Antes de aceitar números de produção, conferir uma janela com faturas conhecidas,
comparar soma/quantidade com a Stripe, verificar modo teste/produção, moeda, fuso,
cobertura e entregas atrasadas. Repetir para os três ciclos e para usuários com e
sem permissão. Conferir o CSV e a versão móvel do painel. Não misturar recibos de
homologação com os de produção; usar bancos e credenciais separados.

Permanecem dependentes de novas fontes: reembolsos/chargebacks/descontos,
reativações e conversão histórica pendente → ativa, UTM/referrer, acessos a artigos
e suporte. Esses indicadores não foram inventados nesta implementação.

## Verificações locais

- 159 testes de backoffice e billing aprovados, incluindo datas de pagamento,
  limites inclusivo/exclusivo, comparação, fuso na virada do dia, precisão monetária,
  ciclos de MRR, expiração/cancelamento, snapshots, legados, truncamento, CSV,
  permissões, auditoria e os fluxos de checkout/webhook.
- Check/migration-check, TypeScript e lint; permanecem quatro avisos preexistentes
  no frontend. Nenhuma consulta real à Stripe, importação ou sincronização operacional.
