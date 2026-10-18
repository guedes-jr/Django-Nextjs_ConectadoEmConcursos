# Pagamentos e assinaturas — etapa 5

Implementação com Stripe Checkout hospedado, sem coleta de cartão pela aplicação.
A integração fica desabilitada enquanto as chaves e os preços não forem configurados.
O deploy e a homologação externa não foram executados nesta etapa.

## Configuração e homologação

1. Aplicar `billing.0005` durante o deploy. A migração preserva as assinaturas e os
   eventos antigos; valores financeiros históricos ficam nulos, sem estimativa.
2. Configurar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_LIVE_MODE=0`
   com credenciais de teste, exclusivamente no backend. Usar `FRONTEND_URL` absoluto
   da aplicação para os retornos de checkout. Em produção, usar HTTPS.
3. Criar Prices recorrentes BRL na Stripe que correspondam aos preços publicados:
   `mensal` = mês/1; `semestral` = mês/6; `anual` = ano/1; quantidade licenciada/1.
   O preço local é o total do ciclo, não o equivalente mensal. Configurar, por exemplo:
   `STRIPE_PRICE_IDS={"padrao":{"mensal":"price_EXEMPLO","semestral":"price_EXEMPLO2","anual":"price_EXEMPLO3"}}`.
   Acrescentar cada plano pago comercializado. Não usar estes IDs ilustrativos.
4. Cadastrar `POST /api/billing/stripe/webhook/` como destino de eventos completos
   da conta na API `2025-03-31.basil`, com os eventos:
   `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated` e
   `customer.subscription.deleted`. O destino exige assinatura Stripe-Signature;
   não exige cookie/login/CSRF. O corpo bruto tem limite de 256 KiB.
5. Em ambiente de homologação, verificar checkout aprovado/recusado, retorno sem
   pagamento, renovação com relógio de teste, repetição/reordenação de eventos,
   expiração de checkout e cancelamento. Verificar no banco a fatura, centavos,
   moeda, datas e período pago, além das permissões reais do aluno.
6. Só após homologação, provisionar chaves/Prices/destino de produção e
   `STRIPE_LIVE_MODE=1`. Objetos e eventos de outro modo são rejeitados. A configuração
   exige ambos os segredos, evitando iniciar contratação sem destino de confirmação.

Referências oficiais: [Checkout recorrente](https://docs.stripe.com/api/checkout/sessions/create),
[webhooks de assinaturas](https://docs.stripe.com/billing/subscriptions/webhooks),
[assinatura e entrega de eventos](https://docs.stripe.com/webhooks),
[faturas na versão fixada](https://docs.stripe.com/api/invoices/object?api-version=2025-03-31.basil).

## Contrato e regras

- `POST /api/subscription/` recebe `plan` e `cycle`, verifica plano ativo/publicado
  e o preço do ciclo escolhido. Plano gratuito é local e imediato. Plano pago
  retorna 202 com `checkout_url`, `checkout_status` e a assinatura atual (ou null).
  O frontend redireciona ao domínio exato `checkout.stripe.com`.
- Uma tentativa UUID persistida precede a chamada externa. Repetições usam a mesma
  chave de idempotência e os mesmos parâmetros. Uma tentativa aberta ou em
  confirmação bloqueia outra contratação e troca para gratuito. A criação de
  checkout não modifica a assinatura existente. Mudanças administrativas também
  são bloqueadas durante checkout e para assinaturas gerenciadas pela Stripe.
- O preço remoto é consultado antes do checkout e precisa corresponder ao valor,
  moeda, intervalo e quantidade do catálogo. Prices devem ser imutáveis: para
  mudar preço de novas contratações, cadastrar outro Price e atualizar o catálogo
  e o mapeamento. Renovações preservam o Price da contratação.
- Checkout concluído ou status `active` do provedor, isoladamente, não concedem
  acesso. Somente `invoice.paid`, após consulta da fatura e da assinatura na Stripe,
  valida o Price, moeda, quantidade e período e concede acesso até o fim pago.
  A versão Basil usa `status=paid` e `parent.subscription_details`, sem depender
  do antigo campo booleano `paid`.
- Recibos financeiros guardam `amount_minor` efetivamente pago em centavos BRL,
  `paid_at`, `period_start/end` e a fatura. Uma fatura tem no máximo um recibo pago,
  mesmo com IDs diferentes de evento. Não se soma preço estimado como recebimento.
- Assinaturas são atualizadas sob bloqueio por usuário. Eventos repetidos são
  reconhecidos; eventos antigos não reduzem o período pago nem ressuscitam um ID
  cancelado. IDs de outra conta de usuário não são recebidos pelas ações públicas.
- Falha de renovação preserva o período já pago. Ao vencer, as capacidades voltam
  ao gratuito, mesmo sem execução de job. O status persistido pode continuar ativo
  até o webhook; `access_active` indica a validade efetiva no contrato público.
- `POST /api/subscription/cancel/` cancela a renovação automática da assinatura do
  próprio usuário. O período pago continua válido. Troca de plano/ciclo com
  assinatura recorrente em andamento é bloqueada para evitar duas recorrências;
  nova contratação fica disponível após o encerramento. Reativação da renovação
  fora deste fluxo não é suportada; não alterar cancelamentos pelo painel externo.
- `POST /api/subscription/checkout/expire/` encerra checkout pendente somente após
  confirmar expiração na Stripe; se já concluído, aguarda-se o webhook. O GET da
  assinatura e o botão de atualização consultam o estado local confirmado.
- Webhooks têm HMAC, comparação constante, tolerância de 5 minutos e separação de
  teste/produção. Recibos e auditoria não armazenam payload bruto, dados de cartão,
  e-mail recebido no evento, segredos ou URL privada de checkout. Modelos financeiros
  são somente leitura no Admin Django; alterações usam serviços auditados.

## Falhas e operação

Falha de rede retorna 503 e mantém a tentativa para repetir com a mesma chave.
Erros de validação retornam 400 e fazem rollback do recibo, permitindo reenviar
após correção; indisponibilidade do provedor retorna 503. Não se confirma evento
financeiro cuja gravação falhou. Eventos de recursos sem vínculo com o projeto
são reconhecidos como ignorados, sem conceder acesso.

A sessão é criada com expiração em 23 horas. Uma tentativa sem ID persistido que
ultrapasse 23 horas bloqueia novas contratações e requer intervenção do suporte;
não se reaproveita cegamente uma chave após sua janela de segurança. Verificar
na Stripe a sessão pelo `metadata.checkout_id`/`client_reference_id`, encerrar a
sessão aberta e reenviar seus eventos pelo destino configurado. Se a criação nunca
chegou ao provedor e não há sessão, a liberação local exige reconciliação operacional
controlada, com evidência e auditoria; não há botão de desbloqueio automático.
Monitorar entregas com falha no painel da Stripe e reenviar os eventos após resolver
configuração ou indisponibilidade. Não apagar tentativas ou recibos para tentar
novamente.

Não estão incluídos nesta etapa: alteração imediata de plano com prorrateio,
portal para trocar cartão, cupons, período de teste, reembolsos/chargebacks e
reconciliação automática em lote. Modificações externas do Price, múltiplos itens
ou faturas paginadas exigem revisão; a integração não presume acesso nesses casos.
As métricas do painel financeiro estão conectadas aos novos recibos desde a etapa 6;
os eventos históricos sem valor continuam indisponíveis para receita realizada.
Consulte [operação de relatórios](operacao-relatorios.md) para as definições e cobertura.

## Verificações locais

Executar `DB_ENGINE=django.db.backends.sqlite3 make test-app APP=apps.billing`,
`make check`, `make typecheck` e `make lint`. Os testes usam respostas simuladas,
corpos assinados e banco temporário; nenhuma cobrança ou chamada Stripe real é
necessária. Concorrência PostgreSQL e entrega externa precisam da homologação acima.
