# Padrão das páginas de gestão do admin

A página `/admin/planos` é a referência inicial de composição. A estrutura comum é:

1. `PageHeader`: título, descrição curta e ação principal de criação no canto direito.
2. `StatCard`: quatro ou cinco indicadores com abrangência e período claros. Indicadores de status podem aplicar filtros e devem mostrar quando estão selecionados.
3. `FilterBar`: busca e seletores com rótulos, agrupados em um cartão, com limpeza dos filtros.
4. `ListToolbar`: quantidade de registros e ordenação.
5. Registros em cartões ou tabela, conforme o conteúdo. Seleção restrita à página atual e ações coletivas com escopo explícito.
6. `ListPagination`: faixa de resultados, quantidade por página e navegação.

Os componentes de filtros, barra e paginação estão em `frontend/components/admin/ListControls.tsx`. As regras de negócio ficam em cada página e na API correspondente.

## Comportamento de referência

- Planos mantém busca, filtros, ordenação e paginação na URL, preservando outros parâmetros e restaurando o estado ao retornar à página.
- Indicadores resumem todos os planos e não mudam conforme a busca. São atualizados após operações de escrita.
- Respostas de buscas anteriores são descartadas. A busca usa um pequeno atraso para evitar uma consulta por tecla.
- Estados vazios distinguem catálogo sem registros de busca sem resultados. Erros permitem nova tentativa.
- Valores monetários usam a apresentação brasileira. MRR é restrito à permissão financeira, considera apenas assinaturas vigentes em BRL e usa o preço contratado quando registrado; nos demais casos utiliza o preço atual do catálogo, sendo uma estimativa.
- A razão entre assinaturas vigentes e total não representa retenção por período ou coorte.
- A API mantém compatibilidade com consumidores sem paginação. Quando `page` é enviado, devolve `count`, `page`, `page_size` e os resultados correspondentes.
- Prévia é identificada como resumo administrativo, sem prometer aparência ou condições de checkout.

## Aplicação nas demais páginas

Usuários já adota a sequência visual com tabela, contagem, ordenação, paginação e estado na URL. O botão “Novo usuário” cria uma conta comum com senha validada pelo Django, sem atribuição de staff, verificação automática de e-mail ou envio de mensagens. Bloqueio exige confirmação e motivo, e usa o histórico de auditoria existente. Páginas somente de consulta podem usar exportação como ação principal. Ações e informações financeiras devem respeitar permissões também no servidor.


## Usuários: indicadores e filtros

- Os indicadores resumem todos os cadastros: total, acesso liberado, bloqueados, novos em 30 dias e assinaturas vigentes (incluindo gratuitas).
- Cada indicador aplica seu filtro; o total limpa os filtros da lista. Assinatura vigente exige status ativo e vencimento ausente ou futuro.
- O filtro de atividade preserva a definição existente de registros em questões, estudos, simulados e notificações, aplicada antes da contagem e da paginação. Ele não representa apenas login; a tabela apresenta o último login separadamente.
- `GET /api/backoffice/users/overview/` fornece os totais sem carregar registros individuais. `GET /api/backoffice/users/` aceita `page`, `page_size`, `ordering` e preserva compatibilidade com `limit`/`offset`.
- `POST /api/backoffice/users/` exige papel de administrador, valida usuário/e-mail/senha e registra auditoria sem senha. A edição de papéis administrativos permanece em Staff.
- O catálogo de planos só é consultado ao abrir a atribuição de assinatura, sem nova consulta a cada busca de usuários.

## Assinaturas

- `/admin/assinaturas` adota indicadores, filtros em cartão, ordenação, contagem e paginação. Busca, status, plano, ciclo e vencimento permanecem na URL.
- A ação principal “Atribuir a um usuário” encaminha à gestão de usuários, onde já existe a atribuição de plano. Não abre um segundo fluxo de cobrança.
- A tabela apresenta usuário com link, plano, ciclo, status, vencimento e origem. Contratos Stripe são identificados como gerenciados pelo provedor, sem botão de edição local. A API mantém a proteção também para checkouts em andamento.
- Os indicadores mostram assinaturas vigentes, pendentes, canceladas e vencimentos em 30 dias. A abrangência é global e independente dos filtros. “Status ativo” inclui vencidas; “Vigentes” exclui vencidas. O filtro de vencidas seleciona apenas contratos ainda com status ativo.
- O MRR é uma estimativa mensal em BRL, restrita à permissão financeira. Usa o valor contratado quando disponível, ou o catálogo atual como aproximação, e exclui assinaturas vencidas e moedas diferentes de BRL. Não representa receita recebida.
- O catálogo de planos é carregado separadamente da busca. Respostas antigas da lista são descartadas. Erros de edição são apresentados dentro do modal.
- `GET /api/backoffice/subscriptions/` aceita paginação opcional, ordenação e filtros combinados; devolve `count` e `page`. Consumidores sem `page` mantêm o limite anterior de 200 registros.

## Staff e Bancas

- As duas páginas adotam `useAdminListing`: estado na URL, busca com atraso, descarte de respostas antigas, contagem e paginação no servidor. O resumo global acompanha a resposta e é calculado antes dos filtros.
- Staff apresenta total, ativos, inativos, administradores e superusuários; filtros por papel e acesso; ordenação por usuário, cadastro e último login. Administradores e superusuários são categorias separadas nos indicadores.
- A gestão de Staff continua exclusiva para superusuários. Sem permissão, a página apresenta a restrição e não oferece cadastro. O usuário não pode remover o próprio acesso de staff nem desativar a própria conta. Pode atualizar os próprios dados sem que flags inalteradas causem erro.
- Criação de Staff valida usuário, e-mail e senha com os validadores do Django. A criação mantém um único papel explícito (administrador, editor ou revisor), sem conceder superusuário.
- Bancas apresenta total, ativas, inativas e destaques; busca por nome, slug e grafias alternativas; filtros de disponibilidade/destaque e ordenação por nome ou cadastro recente.
- Cadastro e edição de Bancas usam modal com campos identificados. A grafia alternativa opcional é salva na mesma transação: um conflito desfaz também as mudanças da banca, evitando estado parcial e duplicação ao tentar novamente.
- Contagens de uso de Bancas continuam baseadas no nome canônico; dados históricos não são reescritos. Administradores e editores recebem ações de escrita; os demais membros da equipe têm consulta conforme a permissão editorial existente.
- As APIs preservam consumidores sem `page`. A lista de Bancas também mantém `limit` e `offset`.

## Concursos e Provas

- Ambas as páginas reutilizam `useAdminListing`, os controles de lista, `CatalogSummary` e a confirmação de ações. Indicadores globais, filtros, ordenação, resultados e paginação seguem a mesma sequência.
- Concursos apresenta total, manuais, importados, publicados e arquivados. Os filtros distinguem origem, publicação editorial, situação das inscrições e UF. A situação do concurso não é confundida com sua publicação.
- Concursos manuais são criados e editados por modal. Os dados de origem dos importados continuam protegidos na API e aparecem somente para consulta no modal. Arquivar/restaurar exige confirmação e preserva o histórico e os vínculos.
- Provas apresenta total, publicadas, rascunhos, vinculadas e sem concurso. A busca inclui título, banca, instituição e cargo; há filtros por ano, concurso, vínculo e visibilidade.
- Cadastro e edição de provas preservam ano, nível e UF. Ano é validado entre 1980 e 2100, concurso inexistente é rejeitado e duplicidades seguem a restrição existente de título/banca/ano. Novos cadastros continuam em rascunho por padrão.
- Publicar/ocultar prova exige confirmação. O vínculo usa opções resumidas de concursos, consultadas separadamente da paginação, sem o limite anterior de 200 opções. A lista recebe o título do concurso diretamente na resposta, sem depender da busca no catálogo carregado no cliente.
- Permissões editoriais existentes são mantidas: administradores e editores escrevem, os demais membros da equipe consultam. As ações de escrita ficam ocultas para perfis de consulta.
- Criação de prova e alterações editoriais são auditadas. O snapshot anterior é capturado antes da edição, preservando a comparação correta de campos.

## Artigos e Notificações

- Artigos adota indicadores globais de total, rascunhos, agendados, publicados e arquivados; busca, categoria, origem, destaque e publicação são filtros preservados na URL. A lista tem ordenação e paginação no servidor.
- O editor de artigos fica em modal, mantém o editor rico e permite prévia das alterações atuais antes de salvar. O agendamento usa horário local no formulário e ISO na API. A criação passa a respeitar agendamento futuro; remover a data de um artigo agendado o retorna a rascunho.
- Publicar, arquivar e retornar a rascunho exigem confirmação, inclusive na seleção em massa. A seleção é restrita à página e limpa ao trocar resultados. Ações editoriais substituem o agendamento anterior.
- Artigos importados continuam protegidos contra edição de conteúdo e duplicação. Perfis de consulta podem ver a prévia; somente perfis com permissão editorial recebem ações de escrita.
- Notificações apresenta cabeçalho com “Novo aviso”, indicadores globais, filtros por publicação/tipo/público, contagem, ordenação e paginação. O formulário foi levado a modal, preservando mídia, links, período, regras de adiamento e prévia.
- A seleção de destinatários permanece paginada e preservada entre buscas. O catálogo de destinatários é consultado quando o editor está aberto. O acompanhamento individual continua disponível após a lista.
- Publicação/agendamento, encerramento e arquivamento usam confirmação dentro da aplicação. A confirmação de publicação explicita o público; avisos obrigatórios exigem justificativa para encerrar. Salvar rascunho não publica nem entrega o aviso.
- Permissões de edição, publicação e acompanhamento continuam sendo fornecidas e aplicadas pelo servidor. A API preserva `limit` e adiciona `page_size`, resumo global e filtros combinados à listagem.

## Questões e Fila de revisão

- Gestão de questões passa a consultar o acervo no servidor com paginação, busca por enunciado/comentário, ID, status (incluindo pendentes), origem, banca, disciplina, ano e ausência de comentário. Os indicadores abrangem todo o acervo; filtros e página ficam na URL.
- Aprovada é um estado editorial: a exibição ao aluno ainda depende das regras de visibilidade da prova. O cadastro deixa de abrir automaticamente e usa modal; a consulta completa mostra enunciado, alternativas, gabarito e comentário.
- Salvar uma questão não a publica automaticamente. O botão de salvar e revisar publicação abre uma confirmação após salvar. Há ação de envio à fila, retirada de aprovação e exclusão com digitação explícita do ID, alertando para remoção de respostas e vínculos. A edição manual envia a versão lida e rejeita sobrescrita de uma versão mais recente.
- A seleção de prova usa opções resumidas sem o corte da primeira página, preservando vínculos em acervos maiores. A API valida ano e prova inexistente antes de gravar.
- A fila mantém a ordem de prioridade existente e passa a ter indicadores, filtros visíveis, paginação e layout empilhado no celular. Banca, disciplina e ano efetivamente chegam à API. Links `?questao=ID` abrem a questão solicitada, inclusive para comparação com questões já revisadas.
- Filtros e seleção são preservados na URL. Respostas antigas de requisições não substituem uma busca recente. O recorte limitado a 300 questões na comparação de parecidas/conflitos é informado quando aplicável.
- O rascunho do revisor é restaurado de `review_note`; salvar envia a versão lida e rejeita questões alteradas ou já revisadas. O contador e a página são atualizados após aprovar/rejeitar; remoção da última questão ajusta a paginação.
- Comentários não salvos impedem alteração dos filtros e exigem confirmação ao trocar de questão. Há salvar e descartar explícitos, além de proteção ao sair da página. Os atalhos precisam ser ativados, ignoram repetição e não iniciam outra gravação durante um salvamento.
- Aprovação com conflito de gabarito exige confirmação adicional. Botões e dicas de atalhos foram alinhados: S salva o rascunho, P pula, J/K navegam. Perfis sem permissão de revisão ficam em consulta.
- O cliente aceita a lista de motivos de rejeição retornada pela API, corrigindo a falha de renderização ao abrir pendentes.

- A fonte da fila é selecionada no catálogo completo, incluindo fontes inativas para importação que ainda possuem acervo para revisar.
- O mínimo de caracteres do comentário é informado pela API, a partir da política de moderação existente (120). O teto incorreto de 120 na interface foi removido; o contador mostra o mínimo e o botão de aprovação permanece desabilitado enquanto ele não for atendido.

### Fontes de questões e Acervo de provas oficiais

- Fontes: indicadores globais de disponibilidade e fila; pesquisa por nome, identificador ou licença; ordenação e paginação com filtros na URL. O botão do cartão abre os filtros da fonte escolhida. Cadastro/configuração respeitam permissões do Django, e buscas exigem perfil editorial. A resposta de uma busca distingue falha, processamento e conclusão parcial; simulações não são apresentadas como importações efetivadas.
- Acervo: cabeçalho com cadastro em modal e acesso aos portais; indicadores de documentos, provas, gabaritos, documentos baixados e provas sem associação. Filtros, ordenação e paginação são aplicados no servidor, sem o antigo limite de 200 resultados na tela paginada. As URLs de consulta e exportação usam o namespace correto de conteúdo.
- A associação possui busca e paginação próprias, restritas a tipos compatíveis do mesmo portal e documentos disponíveis. Detalhes preservam o histórico de downloads. Cadastro, download, descoberta, associação e descarte respeitam as permissões editoriais. A descoberta continua exigindo ação explícita e revisão da prévia; PDFs não são convertidos automaticamente em questões.
- JSON e ZIP usam os mesmos filtros da lista. Exportações acima de 500 documentos retornam erro para refinar os filtros, evitando truncamento silencioso. Os limites existentes de quantidade e tamanho dos PDFs no ZIP continuam vigentes. Indicadores contam documentos; o endpoint operacional de métricas de tentativas permanece disponível.
- Contratos legados sem `page` são preservados para outros consumidores. Nenhuma alteração de esquema ou migração foi necessária.
