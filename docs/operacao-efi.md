# Efí / Gerencianet — planos por período

A integração usa a **API Cobranças** e seu link de pagamento hospedado. O cliente
escolhe cartão de crédito ou boleto/Bolix com Pix na tela da Efí. O site não recebe
número de cartão, CVV ou dados bancários. Cada compra paga o total do ciclo
mensal, semestral ou anual cadastrado no plano. Não há renovação automática.
Uma nova compra fica disponível depois do fim do período vigente.

## Configurar

1. Aplicar a migração `billing.0007` (`make migrate`) durante a implantação.
2. Como superadministrador, abrir **Operação → Pagamentos**, em
   `/admin/configuracoes/pagamentos`. O atalho `/platafom/pagamentos` redireciona
   para essa página protegida do painel.
3. Selecionar Efí e ambiente. Informar **Client ID e Client Secret da API
   Cobranças**, com emissão de cobranças habilitada. Credenciais da API Pix
   direta não substituem as da API Cobranças.
4. Informar a URL pública HTTPS do backend terminando em
   `/api/billing/efi/notifications/`. Ela é enviada automaticamente em cada
   cobrança; deve aceitar POST público, sem login nem redirecionamento.
5. Salvar e usar **Testar conexão Efí salva**. O teste autentica, sem criar cobrança.
   Ele não comprova a liberação de cartões, Bolix ou a entrega das notificações.
6. Habilitar Bolix/Pix na conta Efí e conferir a liberação de cartão/KYC no banco.
   Validar cada meio no ambiente de homologação antes de habilitar produção.
7. Habilitar novas cobranças. Para produção, usar credenciais de produção e
   ambiente Produção. Checkouts sandbox são bloqueados com `DEBUG=False`;
   testes de compra devem acontecer em uma instalação de desenvolvimento isolada.

O certificado `.p12`/`.pem` da API Pix direta não é necessário nesse fluxo de
checkout/Bolix. Não é feito upload de certificado na página. Credenciais e
certificados não devem entrar no Git.

Configuração alternativa, exclusivamente no backend: `BILLING_GATEWAY=efi`,
`EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_SANDBOX=1` (homologação) ou `0`
(produção) e `EFI_NOTIFICATION_URL`. Configurações salvas pelo painel têm
precedência sobre o ambiente. Stripe permanece disponível para contratos
existentes; suas chaves continuam sendo configuradas por variáveis de ambiente.

Credenciais do painel ficam criptografadas no banco, com o mecanismo já usado
para SMTP, derivado de `SECRET_KEY`. Preserve essa chave nos backups e nas
atualizações: trocá-la exige recadastrar as credenciais. A API retorna apenas a
indicação de credenciais salvas, nunca seus valores. Campos vazios na página
preservam o valor anterior. Troca de conta/ambiente exige as duas credenciais e é
bloqueada enquanto houver cobranças pendentes ou períodos Efí vigentes. Após uma
troca, cobranças antigas continuam vinculadas à conta/ambiente de origem; sua
consulta/estorno exige reconciliação na conta original.

Desabilitar novas cobranças não desabilita o processamento das notificações nem
revoga períodos pagos. O teste de conexão não habilita vendas automaticamente.

## Confirmação, acesso e cancelamento

O POST da Efí contém `notification`. O backend consulta esse token com suas
credenciais e consulta também a cobrança canônica na API. Só o estado `paid`,
com `charge_id`, `custom_id` e valor em centavos correspondentes à tentativa
local, concede acesso. `approved`, `identified`, `waiting` e `settled` não liberam
acesso. O estado `settled` representa confirmação manual no banco, não um
recebimento financeiro confirmado pela integração.

Os períodos começam quando a aplicação processa a primeira confirmação e usam
meses de calendário, ajustando o último dia do mês. Repetir notificações não
estende o período nem duplica recibos. A data financeira vem do evento `paid`
consultado na Efí (horários sem fuso interpretados como America/Sao_Paulo).
Se a confirmação acontecer pela atualização manual do status, sem evento de
notificação, `paid_at` registra o momento da confirmação pela aplicação.

A ação **Atualizar status** consulta a cobrança pendente na Efí. **Encerrar
checkout pendente** cancela a cobrança no provedor e verifica o resultado antes
de permitir nova compra. Não cancela o período já comprado. Não há botão de
cancelar renovação automática para a Efí, pois nenhuma renovação é agendada.

Estornos (`refunded`) e contestações (`contested`) revogam somente o acesso
vinculado àquela compra. Uma notificação antiga de pagamento não desfaz uma
reversão já registrada. Os recibos de receita bruta são preservados; o relatório
financeiro existente não calcula receita líquida de taxas, estornos ou impostos.
Compras Efí entram na receita e na contagem de acessos pagos; não entram no MRR
ou ARR de contratos recorrentes Stripe.

## Falhas e reconciliação

O checkout guarda a tentativa antes de criar a cobrança. Esta API não oferece
uma garantia de idempotência de criação usada pelo projeto; após timeout, o
backend **não repete a criação automaticamente**. Mantém a tentativa pendente
para evitar cobranças duplicadas. A notificação recupera o `charge_id` pelo
`custom_id` da tentativa e valida a cobrança na API.

Se a notificação não chegar, verifique a cobrança no painel Efí pelo `custom_id`
(UUID da tentativa), a URL pública e o histórico de notificações. Reenvie a
notificação depois de corrigir o problema. Uma tentativa sem `charge_id` bloqueia
outra compra até a reconciliação; não apague a tentativa para contornar o bloqueio.

Um boleto pode ser pago mesmo depois do cancelamento. Esse pagamento continua
sendo registrado. Se já existir outro período pago vigente, o sistema preserva
o acesso atual e registra `requires_reconciliation=true` na auditoria
`billing.efi_payment_confirmed`. O suporte deve conferir os dois pagamentos e
acertar crédito ou reembolso na Efí; não há crédito automático de sobreposição.

As verificações automatizadas usam respostas simuladas e bancos temporários.
Nenhuma cobrança externa real foi criada na implementação. A homologação com
suas credenciais e a implantação ainda precisam ser executadas.

## Documentação oficial consultada

- [Credenciais e autorização](https://dev.efipay.com.br/docs/api-cobrancas/credenciais/)
- [Link de pagamento](https://dev.efipay.com.br/docs/api-cobrancas/link-de-pagamento/)
- [Notificações](https://dev.efipay.com.br/docs/api-cobrancas/notificacoes/)
- [Estados das transações](https://dev.efipay.com.br/docs/api-cobrancas/status/)
