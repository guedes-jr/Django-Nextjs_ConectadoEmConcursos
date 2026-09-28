# Fase 0 — Contratos de maturidade do admin

Data: 27/09/2026.

## Decisões de compatibilidade

- `apps.notifications.Notification` continua sendo a caixa de entrada individual já usada por eventos do produto. Campanhas administrativas e modais usarão novos modelos; não serão inseridas como notificações comuns.
- O papel técnico inicial continua sendo `is_staff`, mas ações sensíveis passarão a exigir permissões Django específicas. `is_superuser` será obrigatório para diagnóstico, auditoria completa e dados financeiros agregados.
- Conteúdo sincronizado permanece de propriedade do sincronizador. Operações editoriais só alteram campos explicitamente liberados.
- Todas as datas de agendamento são armazenadas em UTC e exibidas no fuso da aplicação.

## Matriz de permissões proposta

| Ação | Staff | Editor | Revisor | Admin | Superusuário |
| --- | --- | --- | --- | --- | --- |
| Ler cadastros editoriais | sim | sim | sim | sim | sim |
| Criar/editar bancas, concursos, provas e artigos manuais | não | sim | não | sim | sim |
| Enviar/aprovar/rejeitar questões | não | não | sim | sim | sim |
| Criar rascunho de campanha | não | sim | não | sim | sim |
| Publicar/encerrar campanha | não | não | não | sim | sim |
| Ver relatórios financeiros | não | não | não | permissão financeira | sim |
| Ver auditoria completa e diagnóstico | não | não | não | não | sim |

A primeira entrega criará permissões Django; grupos pré-configurados serão adicionados somente quando houver processo de gestão de equipe definido.

## Contrato de campanhas de aviso

- Tipos: `info`, `maintenance`, `new_feature`, `urgent`, `required`.
- Escopo: todos os usuários ativos, segmento autorizado, ou destinatários selecionados e congelados na publicação.
- Estados: `draft`, `scheduled`, `published`, `ended`, `archived`.
- Destinatário: `pending`, `viewed`, `snoozed`, `dismissed`.
- “Confirmar visualização” muda para `viewed`; “Ver mais tarde” muda para `snoozed` e define próximo lembrete em 24 horas, limitado a 3 adiamentos por padrão.
- A mídia é URL HTTPS validada. Vídeo é somente URL de provedor permitido; HTML arbitrário, scripts e iframes são proibidos.

## Contrato de auditoria

- Eventos são imutáveis e registram ator, ação, recurso, identificador, data, origem e diff permitido.
- Campos contendo senha, token, cookie, credencial, chave, cabeçalho de autorização, dados completos de pagamento ou dados pessoais não necessários são redigidos antes de persistir.
- Retenção mínima: 12 meses; exportações e consultas financeiras também geram evento.

## Regressões a cobrir

- A caixa de entrada e WebSocket existentes continuam operando sem mudanças.
- Um staff sem permissão não publica campanha, não vê auditoria nem dados financeiros.
- Um destinatário não lê ou confirma aviso de outro usuário.
- Conteúdo importado continua protegido.
- Datas agendadas não publicam antes da hora nem reaparecem após confirmação.
