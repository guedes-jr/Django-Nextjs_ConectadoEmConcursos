# Textos de apoio reutilizáveis

Cadastro em `/admin/textos-apoio`, disponível no menu administrativo e na gestão
de questões. A página segue o padrão de cabeçalho, botão de criação, indicadores,
filtros e lista paginada. Cada texto tem título, conteúdo formatado (com imagens)
e referência/autoria opcional. O mesmo texto pode ser vinculado a várias questões,
inclusive de disciplinas e provas diferentes.

## Uso

1. Cadastre o material em **Textos de apoio → Novo texto**.
2. Em **Questões**, selecione **Texto de apoio** na questão existente; pesquise e
   escolha o texto. Na criação/edição de uma questão manual, use o seletor do formulário.
3. Salve o vínculo. Para removê-lo, selecione **Sem texto de apoio** e salve.
4. Na resolução e nos simulados, o aluno expande/recolhe o texto acima do enunciado.
   A prévia administrativa e a fila de revisão também exibem o texto.

O vínculo é opcional e preserva status, gabarito, respostas e origem da questão.
A edição de um texto compartilhado afeta todas as questões vinculadas; o formulário
informa a quantidade. Textos em uso têm exclusão bloqueada no servidor e na interface.
O catálogo não publica questões automaticamente nem importa material de terceiros.

Administradores e editores cadastram, editam e vinculam textos. Outros membros
ativos da equipe podem consultar o catálogo. As alterações são auditadas e as edições
verificam a versão para impedir sobrescrita de alterações concorrentes.

O tutor utiliza os textos vinculados na recuperação e no contexto das questões
visíveis ao aluno, respeitando a mesma política de visibilidade do banco.

## Implementação e validação

Migração `questions/0027_supporttext_question_support_text.py`, posterior à migração
do catálogo de bancas. A aplicação preserva questões existentes com vínculo vazio.
Não houve preenchimento automático. Backend, migração e frontend foram publicados
em conjunto em produção, conforme o registro abaixo.

Endpoints administrativos: `content/support-texts/`, `content/support-texts/<id>/`
e `content/questions/<id>/support-text/`, sob `/api/backoffice/`.
O JSON público de questões e de sessões de simulado inclui `support_text` (ou `null`),
sem expor o gabarito antes da resposta.

Validações: testes Django de cadastro, permissões, compartilhamento, exclusão,
conflitos, simulado, tutor e enunciados iguais com textos distintos; regressões
focadas de questões/chat; fluxo Playwright com cadastro, vínculo, expansão por
teclado e tela móvel; TypeScript e verificação de migrações.

O plano `plano-banco-questoes.md` mencionado no `AGENTS.md` não estava disponível
na árvore de trabalho. Nenhum plano foi removido ou substituído.

## Publicação em produção — 18/10/2026

- Release: `/srv/conectado/releases/20261018T231131Z-5e50bd3484a0-textos`.
- Build: `5ce38c16-dfaf-401e-b729-8c5df2003f58`.
- Backup anterior: `backup-20261018-201324-308196-c857eb64.tar.gz`.
- Migração aplicada: `questions.0027_supporttext_question_support_text`.
- Manutenção encerrada e serviços Django, Next, worker e dois timers ativos.
- Prontidão HTTPS 200; página administrativa redireciona ao login no mesmo domínio.
- API administrativa de textos e API de questões verificadas com acesso autorizado: 200.

Os hashes dos dados históricos conferiram antes e depois da migração: 417 questões,
75 respostas, 13 provas, 425 concursos, 53 bancas e 59 aliases preservados, incluindo
os vínculos. Integridade SQLite confirmada. O catálogo de textos inicia vazio,
pronto para cadastro editorial; nenhum texto sintético foi criado em produção.

A preparação ocorreu fora da release ativa, com dependências, verificações Django,
TypeScript, build de produção e ensaio de migração em uma cópia isolada do banco.
A promoção gerou backup com os escritores parados e verificou HTTPS, autenticação
do admin e versão do worker PWA antes de concluir.

Evidências em `/srv/conectado/operations/`: `textos-verification.json`,
`textos-api-verification.json` e `textos-promotion-20261018-231322.log`.

Publicado por overlay com manifesto e hashes sobre `5e50bd3`, preservando o catálogo
de bancas da release anterior. Os arquivos locais ainda precisam acompanhar o
próximo commit/push. O manifesto ativo exige as migrações 0026, 0027 de questões e
0007 de concursos antes de uma atualização futura pelo Git.
