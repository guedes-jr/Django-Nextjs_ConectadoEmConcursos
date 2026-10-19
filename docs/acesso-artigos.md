# Artigos e notícias

O menu oferece duas áreas distintas:

- `/noticias`: notícias importadas pela automação, com acesso à fonte original.
- `/artigos`: materiais de estudo e orientações sobre concursos publicados pela equipe em `/admin/artigos`.

As APIs `/api/news/` e `/api/articles/` filtram respectivamente as origens `imported` e `manual`, inclusive no detalhe, na busca, nas categorias e na paginação. Um conteúdo não é disponibilizado na rota da outra área. Não há alteração dos registros existentes ou da rotina de importação.

O corpo usa a mesma renderização sanitizada de conteúdo formatado já disponível
na plataforma, preservando parágrafos, destaques, links e imagens permitidas.
Falhas temporárias na leitura oferecem nova tentativa; conteúdo inexistente ou
indisponível apresenta mensagem específica.

Para disponibilizar um artigo próprio, cadastre-o em `/admin/artigos` e defina seu
status como **Publicado**. Salvar como rascunho não o disponibiliza ao aluno.
A API de leitura exige `is_published=True` e estado editorial `published` tanto
na lista quanto no detalhe. Agendados, rascunhos, arquivados e registros retirados
continuam ocultos; usuários comuns não recebem acesso à gestão editorial.

No diagnóstico de 18/10/2026, produção tinha 450 notícias importadas publicadas e
nenhum artigo manual. Não foram criados artigos sintéticos nem publicados
rascunhos para corrigir a navegação.

Validação da separação: 20 testes Django focados; Playwright com conta comum separada da conta
administrativa, artigo sem URL externa, rascunho oculto, leitura formatada e tela
móvel, notícia importada com fonte e busca sem mistura de origens; TypeScript e ESLint.

## Histórico: publicação do acesso aos artigos — 18/10/2026

- Release: `/srv/conectado/releases/20261018T231737Z-5e50bd3484a0-artigos`.
- Build: `f5118f80-ebd1-400c-a59a-72c36d2cc824`.
- Backup: `backup-20261018-201926-671310-c3e342cd.tar.gz`.
- Sem alteração de esquema ou migrações adicionais.
- Conta comum existente: API de leitura 200 com 450 conteúdos; gestão editorial 403.
- HTTPS de prontidão 200, autenticação e PWA verificados; serviços e timers ativos.

A comparação de hashes antes/depois confirmou a preservação de artigos, questões,
respostas, textos de apoio e vínculos. Nenhum conteúdo sintético foi criado e
nenhum rascunho foi publicado. Evidências em `/srv/conectado/operations/`:
`artigos-verification.json`, `artigos-api-verification.json` e
`artigos-promotion-20261018-231924.log`.

A release inclui os recursos de bancas e textos de apoio já publicados, com overlay
e manifesto sobre `5e50bd3`. As alterações locais ainda precisam acompanhar o
próximo commit/push; a proteção das três migrações anteriores continua ativa.
