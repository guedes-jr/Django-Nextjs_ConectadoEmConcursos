# Operação — Central de notificações

## Implantação

1. Aplicar as migrações, incluindo `notifications.0005_adminnotification_recipients_materialized_at`.
2. Garantir Redis e worker django-q em execução na infraestrutura.
3. Agendar `manage.py publish_scheduled_notifications` de forma recorrente (por exemplo, a cada minuto).
4. Validar um rascunho com destinatário de teste, prévia, publicação, confirmação e adiamento.
5. Validar uma campanha segmentada e a criação dos destinatários pelo worker.

A migração não cria destinatários. Campanhas amplas publicadas que já têm
público recebem o marcador de materialização, preservando esse público.

## Autoria e conteúdo

Editor e Administrador criam/editam rascunhos. Somente Administrador ou
superusuário publica, agenda, encerra e arquiva. A tela recebe essas capacidades
da API. O acompanhamento individual exige Editor, Administrador ou superusuário.

O corpo usa texto simples com quebras de linha; HTML não é permitido. Imagens são
URLs HTTP(S), vídeos são links para YouTube/Vimeo e os links adicionais exigem
texto e URL HTTP(S). Vídeo abre em nova aba, sem reprodução automática. A prévia
compartilha o componente do aluno, e não registra visualização nem adiamento.

Datas do formulário usam o horário local do navegador e são enviadas com fuso
explícito. O intervalo de adiamento aceita de 1 a 8.760 horas, e o limite aceita
de 0 a 100 adiamentos. Zero desabilita o botão de adiamento para o aluno.

## Público e processamento

- A busca de usuários retorna somente ativos, com id, nome de usuário e e-mail;
  permite filtros de plano/status e paginação (50 por padrão; máximo 100).
- A seleção manual é preservada entre páginas e filtros. A ação em lote afeta
  apenas a página exibida, e a tela mostra o total selecionado.
- O público amplo/segmentado é materializado em lotes em tarefa assíncrona após
  a transação de publicação. O segmento é avaliado quando essa tarefa começa.
- O marcador `recipients_materialized_at` congela o público após o primeiro
  processamento, inclusive quando nenhum usuário corresponde ao segmento.
- Repetir publicação ou processamento não adiciona destinatários posteriores.
- Avisos publicados não aceitam edição. Avisos encerrados/arquivados não podem
  ser republicados; crie outro rascunho para uma nova campanha.
- Campanhas agendadas cujo período já terminou são encerradas pelo agendador.

Na lista, “Processamento pendente” indica que a tarefa de público ainda não
concluiu. Verifique o worker e suas falhas; o botão Atualizar consulta o estado.
Não marque a materialização como concluída manualmente para ocultar uma falha.

## Acompanhamento

A ação Destinatários mostra estado, primeira exibição, confirmação, próximo
lembrete e quantidade de adiamentos. Há filtros por estado e nome/e-mail,
paginação e atualização manual. Confirmações e adiamentos ficam vinculados ao
usuário; os endpoints do aluno não permitem agir por outro destinatário.
