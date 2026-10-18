# Assistente, materiais e simulados com OpenRouter

O chat busca automaticamente até cinco questões aprovadas da plataforma por termos
do pedido, com peso maior para disciplina e enunciado. A recuperação é lexical:
não usa embeddings, fontes externas nem importação. Sem correspondência, o tutor
é instruído a informar a falta de material e pedir um tema mais específico.

O contexto contém enunciado, alternativas, gabarito e comentário cadastrados, com
limites de tamanho. A lista de referências exibida vem do servidor, nunca do modelo.
Ela representa o material enviado ao tutor, não uma comprovação de cada afirmação.
Questões que deixam de estar aprovadas saem das listas de referências e dos novos
simulados. Textos históricos já gerados e materiais salvos preservam seu conteúdo.

## Configuração

No ambiente do backend, use `AI_PROVIDER=openrouter`, configure
`OPENROUTER_API_KEY` e mantenha `OPENROUTER_MODEL=openrouter/free`.
`OPENROUTER_TIMEOUT` tem padrão de 45 segundos. A chave nunca vai ao frontend.
Não foi feita chamada real ao provedor durante a implementação.

Por padrão `OPENROUTER_ALLOW_PAID=false`: somente `openrouter/free` ou identificadores
terminados em `:free` são aceitos; cada pedido também impõe preço máximo zero para
entrada e saída. Não há troca automática para OpenAI ou modelo pago em caso de erro.
O roteador gratuito pode mudar o modelo escolhido; o modelo efetivamente retornado
e os tokens são registrados em `ChatUsage`. Limites/disponibilidade do OpenRouter
continuam independentes das cotas da plataforma.

Modelos pagos exigem alterar explicitamente `OPENROUTER_ALLOW_PAID=true` e
`OPENROUTER_MODEL`. A integração antiga com OpenAI permanece disponível somente
quando `AI_PROVIDER=openai` for configurado explicitamente.

As permissões e cotas comerciais existentes são preservadas: plano gratuito usa
assistência local; Padrão e Avançado podem usar o provedor configurado. Sem chave,
o chat usa assistência local, identificada na interface, com referências recuperadas.
Na indisponibilidade do provedor, responde 503 e preserva a mensagem do estudante;
a falha não registra consumo bem-sucedido. Seleção manual de contexto permanece
restrita ao Avançado; busca automática funciona em todos os planos.

## Fluxo de estudo

- No ChatIA, peça explicações sobre um tema específico e abra as questões de referência.
- “Salvar material” guarda uma cópia privada na Biblioteca de Materiais (`/materials`),
  acessível também pelo menu de estudos. A cópia sobrevive à exclusão da conversa.
  Salvar duas vezes a mesma resposta retorna erro de validação. Excluir um material
  não exclui a conversa nem as questões.
- “Praticar questões relacionadas” abre uma confirmação e cria um simulado com até
  cinco questões recuperadas para aquela resposta. Não cria questões sintéticas.
  Enunciados e alternativas vêm do banco; gabaritos não são enviados no início.
  A submissão usa o serviço existente, suas cotas, correção e histórico.
- As referências são material de apoio; a IA pode errar. Os gabaritos cadastrados
  continuam sendo a fonte da correção. Não existe alteração automática de questões.

As migrações `chat.0003` e `chat.0004` devem ser aplicadas no deploy com `make migrate`.
Nenhuma migração foi aplicada ao banco operacional nesta implementação. A CI mantém
as chaves vazias e usa banco temporário. Os testes do provedor são simulados.

Validação local: 26 testes de chat/workspace passaram; o fluxo completo de busca,
salvamento, início e correção do simulado passou no Playwright (7 testes funcionais).
`make check`, `make typecheck` e `make lint` passaram, com quatro avisos de lint
preexistentes. Os testes do OpenRouter usam respostas simuladas; o E2E usa assistência
local sem credenciais externas.

Referências oficiais consultadas:
[roteador gratuito](https://openrouter.ai/openrouter/free),
[API de chat](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request),
[limites de preço por provedor](https://openrouter.ai/docs/guides/routing/provider-selection).
