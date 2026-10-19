# Atualização de produção — 18/10/2026

Atualização autorizada por SSH, após o push de `main`.
Este registro complementa a [implantação inicial](implantacao-2026-10-18.md).

## Release publicada

- Commit: `5e50bd3484a0f23f95f8f330ba18a207e812eac6`.
- Release: `/srv/conectado/releases/20261018T185933Z-5e50bd3484a0`.
- Ponteiro ativo: `/srv/conectado/current`; o caminho habitual em `/var/www` permanece válido.
- Build Next: `d840c4a1-d17c-4a73-937b-0a3f2e745928`.
- Backup anterior à promoção: `backup-20261018-160430-844017-c2d95d59.tar.gz`.
- Migrações: não havia migrações pendentes no momento da atualização.
- Banco, mídia, arquivos privados e dotenv compartilhados permaneceram nos caminhos persistentes existentes.

O código foi buscado do Git em cache separado, extraído para uma nova release e
validado com virtualenv e build próprios. A manutenção foi usada para parar os
escritores, criar backup, verificar migrações/coletar estáticos e promover o ponteiro.
Não foram executadas importações, sincronizações, cobranças ou testes de envio de e-mail.

## Atualizador corrigido

`./scripts/update.sh` agora executa a atualização sem exigir `--apply`.
`--plan` continua somente consulta. O script reconhece a instalação por releases,
preserva dados/configuração e prepara dependências e build com o site ainda ativo.
O Node 24 dedicado é usado sem alterar o Node global.

A correção do script foi aplicada como patch de bootstrap sobre o commit publicado,
pois ela ainda não estava no Git. `deployment.json` registra o commit, a release
anterior e o hash do script. A correção local, seus testes e esta documentação
precisam acompanhar o próximo commit/push.

O script da release anterior também recebeu a correção, para atender sessões SSH
que ainda estejam naquele diretório. Sua cópia anterior foi preservada em
`/srv/conectado/operations/update-before-20261018.sh`.

## Permissões e aviso operacional

A primeira promoção foi interrompida por sudo que exigia senha. O tráfego anterior
foi restabelecido sem mudança de banco ou ponteiro; a promoção foi concluída pela
sessão root autorizada. Após autorização explícita do usuário, foram provisionados
somente os quatro comandos exatos de start/stop dos serviços, jobs e timers do
aplicativo em `/etc/sudoers.d/zz-conectado-update`. Não foi concedido `NOPASSWD: ALL`.

O preflight agora verifica a opção `!authenticate`, pois apenas `sudo -l comando`
não comprova execução sem senha. Falhas de permissão são rejeitadas antes de criar
o marcador de manutenção.

O transporte de e-mail continua em console, uma pendência anterior. O marcador
privado `/srv/conectado/config/allow-console-email` permite somente o aviso
`core.W003` quando o backend é exatamente console. O aviso aparece no log;
outros avisos e erros continuam bloqueando a publicação. Remover o marcador após
homologar SMTP. Não houve configuração de provedor nem envio real.

## Validação

- 16 testes locais do atualizador aprovados: execução padrão, modo de consulta, releases, falhas, proteção da manutenção e exceção restrita de e-mail.
- Sintaxe Bash, configuração de produção, drift de migrações, dependências Python, TypeScript e build aprovados.
- Prontidão pública 200, serviços Django/Next/worker e dois timers ativos, manutenção removida.
- Redirecionamentos administrativos, manifesto e identidade do service worker conferidos na promoção.
- A versão do script no servidor foi comparada à local; sudo restrito validado com `visudo` e execução idempotente de start dos serviços já ativos.

O fluxo autenticado completo em produção e a observação por 48 horas continuam
como aceites operacionais separados. A release anterior foi preservada; não há
restauração automática de banco em caso de falha.

## Publicação posterior: textos de apoio

Publicada a release `20261018T231131Z-5e50bd3484a0-textos`, preservando o catálogo
de bancas da release intermediária `20261018T225152Z-5e50bd3484a0-bancas`.
Build `5ce38c16-dfaf-401e-b729-8c5df2003f58`, com migração 0027 de questões aplicada
e backup `backup-20261018-201324-308196-c857eb64.tar.gz`.
Prontidão, APIs, autenticação administrativa, PWA e serviços/timers verificados.
Dados históricos preservados por comparação de hashes; nenhum texto sintético
criado em produção. Detalhes em [textos de apoio](textos-apoio.md).

A publicação usa overlay com manifesto sobre `5e50bd3`; enviar as alterações locais
ao Git antes das próximas atualizações. A proteção do atualizador exige as três
migrações adicionadas pelas duas publicações.

## Correção posterior: leitura de artigos pelo aluno

Publicada a release `20261018T231737Z-5e50bd3484a0-artigos`, build
`f5118f80-ebd1-400c-a59a-72c36d2cc824`, com backup
`backup-20261018-201926-671310-c3e342cd.tar.gz`. A navegação identifica **Artigos e
notícias**, com leitura interna independente de URL externa e formatação do corpo.
Rascunhos, agendados e arquivados ficam ocultos na API de lista e detalhe.
Conta comum verificada em produção: leitura 200 e gestão editorial 403; 450 notícias
importadas e nenhum artigo manual. Dados históricos preservados, sem nova migração.
Detalhes em [acesso aos artigos](acesso-artigos.md).

## Retirada da Biblioteca de Materiais

Publicada a release `20261018T232242Z-5e50bd3484a0-sem-biblioteca`, build
`d1f8ebee-5e26-4dcd-8a6d-e96954055cc5`, com backup
`backup-20261018-202446-536447-db909efd.tar.gz`. Removidos navegação, salvamento
e API; endereço antigo redireciona ao ChatIA após autenticação. Sem nova migração,
com dados e conversas preservados. API removida 404, chat de conta comum 200 e
serviços/timers ativos. Registro em [operação de IA](operacao-ia.md).

## Reformulação de Concursos e Provas

Publicada a release `20261018T233543Z-5e50bd3484a0-concurso-hub`, build
`d07f3552-0467-4a55-b089-2f297c2955ed`, com backup
`backup-20261018-203747-394643-ff04b0fe.tar.gz` e migração `concursos.0008`.
Concurso passa a centralizar dados, página oficial, materiais e provas; a prova
apresenta seu contexto antes do simulado completo, integrado à correção/histórico.
Admin gerencia os recursos com publicação explícita e vínculos validados.
Dados históricos, serviços e permissões conferidos; nenhum vínculo foi inferido
ou documento importado. Registro completo em [concursos, provas e simulados](concursos-provas-simulados.md).

## Upload de arquivos nos materiais do concurso

Publicada a release `20261018T235427Z-5e50bd3484a0-pdf-upload`, build
`74f122c6-0db4-4fae-8fb4-54367c1e5083`, com migração `concursos.0009` e backup
prévio `backup-20261018-205639-326759-532111f8.tar.gz`.
Upload privado de PDFs de até 25 MB, prévia da equipe, publicação explícita,
download autenticado, substituição e limpeza após commit. Arquivos incluídos no
backup/restauração com lock compartilhado entre operações de escrita e backup.
Ensaio isolado no servidor e fluxos de navegador passaram; dados operacionais
preservados. Backup do novo formato conferido:
`backup-20261018-205726-787782-7dc44605.tar.gz`.
Detalhes em [concursos, provas e simulados](concursos-provas-simulados.md).
