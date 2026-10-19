# Concursos, provas e simulados

O percurso do aluno é **Concurso → Prova → Simulado → Histórico**. As páginas de
listagem continuam nos mesmos endereços; cada item agora abre uma apresentação
antes da prática. Links antigos de questões e simulados continuam funcionando.

## Concurso como central

`/concursos/<id>` reúne situação das inscrições, órgão, banca, UF, prazo, vagas,
remuneração e cargos disponíveis no cadastro. A página oficial do concurso é um
campo editorial separado da fonte da informação: uma notícia importada não é
apresentada como se fosse o edital ou a página oficial.

A central contém apresentação, documentos e materiais publicados, além das provas
vinculadas. Concursos encerrados continuam úteis para estudo; arquivados ficam
indisponíveis ao aluno. Dados não cadastrados são apresentados como não informados.

Em `/admin/concursos`, **Detalhes** permite editar a apresentação e página oficial,
inclusive nos registros importados, sem sobrescrever os dados protegidos da fonte.
**Materiais** abre a gestão de editais, provas em PDF, gabaritos preliminares/finais,
materiais de estudo e links úteis. Cada material tem título, tipo, descrição,
origem, vínculo opcional com uma prova do mesmo concurso e publicação explícita.
Novos materiais começam em rascunho.

Materiais gerais aparecem em todas as provas desse concurso. Os específicos
aparecem somente na prova correspondente. O admin aceita um link HTTP(S), um PDF enviado ou um
documento do acervo já existente; não baixa arquivos nem cria vínculos por inferência.
No caso do acervo, o aluno abre a URL original: arquivos privados, caminhos de
disco e histórico de downloads não são expostos. A publicação exige conferência
editorial, inclusive quando o documento está cadastrado no acervo.

## Prova como preparação para o simulado

`/exams/<id>` apresenta instituição, cargo, banca, ano, escolaridade, UF,
disciplinas, quantidade de questões aprovadas disponíveis e concurso relacionado.
Exibe os materiais gerais do concurso e os específicos da prova.

**Preparar simulado desta prova** abre Simulados com a prova selecionada e modo
**Prova completa**. O aluno escolhe o tempo e inicia explicitamente; consultar
páginas não cria sessões. A sessão inclui todas as questões aprovadas vinculadas,
ordenadas pelo número original e, nos casos sem número ou com empate, pelo ID.
Filtros gerais não recortam uma prova completa. A quantidade cadastrada pode ser
menor que a do documento original; a interface informa essa limitação.

A correção ocorre ao concluir, com o mesmo serviço, cotas, respostas e histórico
já usados em Simulados. O histórico oferece o link da prova utilizada. A prática
individual continua disponível em `/questions?exam=<id>`. Provas sem questões
aprovadas oferecem seus dados/materiais, sem permitir iniciar uma sessão vazia.

## Regras de vínculo e publicação

- Administradores/editores gerenciam os recursos; alunos consultam somente publicados.
- Provas e materiais em rascunho ficam ocultos. Arquivar o concurso oculta sua central,
  seus recursos e o link ao concurso na apresentação da prova.
- Um recurso específico exige uma prova do mesmo concurso. Mudar a prova de concurso
  exige resolver antes os materiais associados; remover o vínculo não move documentos.
- Edições e remoções verificam a versão e geram auditoria. Excluir um recurso remove
  a associação, preservando o documento original do acervo.
- Dados históricos não são vinculados automaticamente com base em títulos parecidos.

## Implementação e verificações

Migração `concursos/0008_concurso_description_concurso_official_url_and_more.py`,
com dependência de `questions/0027`. Adiciona apresentação, página oficial e recursos,
sem popular ou reescrever os dados existentes. O plano `plano-banco-questoes.md`
citado no AGENTS não estava presente; nenhum plano foi removido ou substituído.

Testes focados cobrem visibilidade, vínculo entre módulos, documentos privados,
edição de importados, bloqueio de mudança incompatível de concurso, conflitos,
sessão completa em ordem e histórico. Playwright valida criação/publicação de
material no admin e o percurso do aluno até o resultado/histórico, inclusive no
celular. TypeScript, ESLint e verificação de migrações fazem parte da validação.

## Produção — 18/10/2026

Release `/srv/conectado/releases/20261018T233543Z-5e50bd3484a0-concurso-hub`, build
`d07f3552-0467-4a55-b089-2f297c2955ed`, backup
`backup-20261018-203747-394643-ff04b0fe.tar.gz`. Migração `concursos.0008` aplicada
após ensaio em cópia isolada do banco. Prontidão HTTPS e verificações de PWA
aprovadas; Django, Next, worker e dois timers ativos, sem manutenção pendente.

APIs de detalhe de concurso, prova, materiais e histórico verificadas com conta
comum: 200. Gestão de recursos: 403 para aluno e 200 para administrador. As rotas
de detalhe estão presentes no build protegido do Next.

Comparação de hashes confirmou a preservação dos dados históricos: 425 concursos,
13 provas, 417 questões, 75 respostas e um simulado existente, além de artigos,
textos, materiais antigos e conversas. Integridade SQLite confirmada. A tabela de
recursos começa vazia; documentos e vínculos dependem da gestão editorial. Nenhum
material sintético, sessão, importação ou download foi criado em produção.

Evidências em `/srv/conectado/operations/`: `concurso-hub-verification.json`,
`concurso-hub-api-verification.json` e `concurso-hub-promotion-20261018-233744.log`.
A publicação usa overlay com manifesto sobre `5e50bd3`; as alterações locais ainda
precisam acompanhar o próximo commit/push. O atualizador exige também a nova
migração `concursos/0008` para impedir publicar código incompatível com a release.

## Upload de PDFs

Em **Admin → Concursos → Materiais**, escolha **Enviar arquivo PDF** na origem.
Aceita PDFs de até 25 MB por arquivo, com validação de extensão, tipo e assinatura.
Informe título, tipo, descrição e prova opcional; salve em rascunho para conferir
ou marque a publicação para os alunos. O admin pode baixar a prévia restrita.

Os arquivos usam nomes aleatórios fora da mídia pública, com tamanho, nome original
normalizado e SHA-256 registrados. Para substituir, edite o material e selecione
outro PDF. Para trocar por link/acervo, mude a origem; o arquivo anterior só é
removido após salvar com sucesso. Excluir o material enviado também remove seu PDF
após o commit. Falhas de gravação preservam o arquivo anterior.

O download exige autenticação e verifica publicação do material, concurso e prova,
com prévia restrita à equipe. O aluno recebe um anexo com cache privado desativado;
nenhum caminho de armazenamento é devolvido. Downloads e alterações são auditados.
A seção de PDFs enviados integra backup/restauração, incluindo pasta vazia e
recuperação das versões anteriores no restore.

A migração `concursos/0009` adiciona campos de arquivo aos recursos existentes, sem
alterar seus links. O envio não extrai nem cadastra questões automaticamente.

## Upload publicado — 18/10/2026

Release `/srv/conectado/releases/20261018T235427Z-5e50bd3484a0-pdf-upload`, build
`74f122c6-0db4-4fae-8fb4-54367c1e5083`. Migração `concursos.0009` aplicada.
Backup anterior à promoção: `backup-20261018-205639-326759-532111f8.tar.gz`.
Backup conferido no novo formato: `backup-20261018-205726-787782-7dc44605.tar.gz`,
com seção `concurso-files/`, manifesto correspondente e permissão 0600.

Verificados localmente 72 testes focados de API, armazenamento, backups e auditoria,
mais dois fluxos Playwright com contas separadas, incluindo download autenticado e
continuidade do simulado. TypeScript, ESLint, Django e migrações passaram.

No servidor, ensaio isolado validou upload 201, prévia da equipe 200, aluno sem
publicação 404, download publicado 200 e restauração do PDF/registro por backup.
O ensaio utilizou cópia do banco e arquivos temporários, sem recursos de teste no
banco ativo. Build e verificações de produção passaram antes da promoção.

Após publicar: prontidão HTTPS 200; gestão 200 para administrador/403 para aluno;
download anônimo 403; armazenamento privado gravável fora de MEDIA_ROOT. Serviços
e timers ativos, manutenção encerrada e dados históricos preservados por hashes.
O catálogo de materiais de produção permanecia vazio, pronto para os documentos reais.

Evidências em `/srv/conectado/operations/`: `pdf-upload-shadow-result.json`,
`pdf-upload-verification.json`, `pdf-upload-api-verification.json`,
`pdf-upload-backup-verification.json` e `pdf-upload-promotion-20261018-235635.log`.
Publicado por overlay com manifesto sobre `5e50bd3`. Enviar os arquivos locais no
próximo commit/push; o atualizador exige também a migração `concursos/0009`.
