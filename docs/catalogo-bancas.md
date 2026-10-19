# Catálogo de bancas e vínculos editoriais

## Diagnóstico e escopo

Em produção, o catálogo `BancaCatalog` estava vazio, enquanto provas e questões
continham cinco identificadores textuais de banca. Os filtros públicos consultam
o acervo e por isso funcionavam mesmo sem o cadastro administrativo.

Foi preparada uma base inicial de 53 organizadoras, com nome, site oficial,
descrição, siglas/grafias alternativas e fontes verificadas em 18/10/2026.
A base não pretende representar todas as organizadoras existentes no Brasil.
Dados sem confirmação, imagens e dados de contato não verificados não são inventados.
Domínios que passaram a mostrar conteúdo sem relação com concursos foram excluídos.

A fonte versionada é `backend/apps/backoffice/data/bancas-brasil.json`.
Descrições existentes preenchidas por editores são preservadas. AOCP e Instituto
AOCP são cadastros separados. SEPROD e IBPTEC não são tratados como sinônimos.

## Relações e manutenção

- Provas recebem `banca_catalog`, mantendo o campo textual histórico `banca`.
- Concursos recebem a relação opcional `banca`, separada do órgão contratante.
- Novas gravações de provas resolvem o nome/alias exato normalizado para o catálogo. A seleção editorial pode informar diretamente o identificador da banca.
- Os formulários de provas e concursos permitem selecionar e pesquisar nome ou sigla. A banca de concursos importados pode ser enriquecida sem editar os dados da notícia.
- A API valida bancas inativas, incompatibilidade de banca entre prova e concurso e duplicidade por título/banca/ano, inclusive usando grafias alternativas.
- Contagens de questões consideram aliases; contagens de provas e concursos incluem os vínculos persistidos.
- O cadastro não reescreve o campo de banca das questões, não mescla provas e não altera o vínculo prova–concurso por semelhança de nomes.

A operação cria vínculos de concurso somente por unanimidade completa das provas
já associadas, ou por correspondência exata de uma notícia revisada com fonte
oficial registrada. Vínculos editoriais existentes não são substituídos.
Os concursos sem evidência suficiente continuam sem banca, disponíveis para revisão.
Divergências entre título SEPROD e banca IBPTEC são reportadas para conferência.

## Aplicação controlada

Aplicar `questions.0026` e `concursos.0007` junto do código correspondente.
Antes de gravar em produção, criar backup com os escritores parados e ensaiar em
uma cópia isolada do banco.

```sh
cd backend
DJANGO_ENV=production .venv/bin/python manage.py populate_banca_catalog
DJANGO_ENV=production .venv/bin/python manage.py populate_banca_catalog --apply
```

O primeiro comando simula e desfaz cadastros/vínculos. O histórico de execução do
comando é auditado. `--apply` grava em transação e registra auditoria; executar
novamente não duplica cadastros ou aliases. Não faz consultas de rede, download de
provas, sincronização de notícias ou importação de questões.

Enviar o código e as migrações ao Git antes da próxima atualização pelo fluxo de
`main`, para preservar o comportamento publicado por artefato.

## Fontes institucionais

| Banca | Fonte oficial |
| --- | --- |
| CEBRASPE | [Portal oficial](https://www.cebraspe.org.br/concursos/) |
| FGV | [Portal oficial](https://conhecimento.fgv.br/concursos) |
| FCC | [Portal oficial](https://www.concursosfcc.com.br/) |
| VUNESP | [Portal oficial](https://www.vunesp.com.br/) |
| CESGRANRIO | [Portal oficial](https://www.cesgranrio.org.br/) |
| Instituto AOCP | [Portal oficial](https://www.institutoaocp.org.br/) |
| IBFC | [Portal oficial](https://concursos.ibfc.org.br/) |
| IDECAN | [Portal oficial](https://idecan.org.br/) |
| Instituto Consulplan | [Portal oficial](https://www.institutoconsulplan.org.br/) |
| IBADE | [Portal oficial](https://ibade.org.br/) |
| IADES | [Portal oficial](https://www.iades.com.br/) |
| Quadrix | [Portal oficial](https://quadrix.org.br/) |
| FUNDATEC | [Portal oficial](https://www.fundatec.org.br/) |
| FUNDEP | [Portal oficial](https://www.gestaodeconcursos.com.br/) |
| FUMARC | [Portal oficial](https://www.fumarc.com.br/) |
| FEPESE | [Portal oficial](https://fepese.org.br/concursos/) |
| FADESP | [Portal oficial](https://portalfadesp.org.br/) |
| FAURGS | [Portal oficial](https://www.faurgs.com.br/) |
| FAFIPA | [Portal oficial](https://www.fundacaofafipa.org.br/) |
| FAUEL | [Portal oficial](https://www.fauel.org.br/) |
| FURB | [Portal oficial](https://concursos.furb.br/) |
| Fundação La Salle | [Portal oficial](https://fundacaolasalle.org.br/concursos/) |
| Legalle | [Portal oficial](https://legalleconcursos.com.br/) |
| Objetiva | [Portal oficial](https://www.objetivas.com.br/) |
| Instituto Mais | [Portal oficial](https://www.institutomais.org.br/) |
| IBAM | [Portal oficial](https://www.ibam-concursos.org.br/) |
| IBGP | [Portal oficial](https://www.ibgpconcursos.com.br/) |
| IDCAP | [Portal oficial](https://www.idcap.org.br/) |
| IDIB | [Portal oficial](https://concursando.idib.org.br/) |
| Instituto ACCESS | [Portal oficial](https://concursos.access.org.br/) |
| Instituto Avalia | [Portal oficial](https://www.avalia.org.br/) |
| SELECON | [Portal oficial](https://selecon.org.br/) |
| CONSULPAM | [Portal oficial](https://www.consulpam.com.br/) |
| ADM&TEC | [Portal oficial](https://www.admtec.org.br/) |
| IGEDUC | [Portal oficial](https://igeduc.org.br/) |
| IAUPE | [Portal oficial](https://www.upenet.com.br/) |
| IBPTEC | [Portal oficial](https://ibptec.org.br/concursos/) |
| SEPROD | [Portal oficial](https://www.seprod.com.br/concursos/) |
| OMNI | [Portal oficial](https://www.omniconcursospublicos.com.br/) |
| IPEFAE | [Portal oficial](https://www.ipefae.org.br/) |
| Instituto Verbena/UFG | [Portal oficial](https://institutoverbena.ufg.br/) |
| AOCP | [Portal oficial](https://www.aocp.com.br/) |
| CPCON/UEPB | [Portal oficial](https://cpcon.uepb.edu.br/) |
| COPESE/UFPI | [Portal oficial](https://copese.ufpi.br/) |
| CEV/UECE | [Portal oficial](https://www.uece.br/cev/) |
| NC/UFPR | [Portal oficial](https://servicos.nc.ufpr.br/) |
| COPS/UEL | [Portal oficial](https://www.cops.uel.br/) |
| FUNCERN | [Portal oficial](https://funcern.br/concursos/) |
| IBRASP | [Portal oficial](https://ibrasp.org.br/) |
| FUNVAPI | [Portal oficial](https://www.funvapi.com.br/) |
| INDEPAC | [Portal oficial](https://indepac.selecao.net.br/) |
| Instituto Nosso Rumo | [Portal oficial](https://www.nossorumo.org.br/) |
| Instituto Social Univida | [Portal oficial](https://www.institutounivida.org.br/) |

## Resultado em produção — 18/10/2026

Publicada a release `20261018T225152Z-5e50bd3484a0-bancas`, com 53 bancas,
59 aliases, 13 provas vinculadas e 5 concursos vinculados com evidência oficial.
As 417 questões e os textos históricos de banca foram preservados; o catálogo
contabiliza essas questões pelas grafias alternativas. A integridade SQLite e a
API administrativa foram verificadas após a publicação.

Permanecem 420 concursos sem banca confirmada. Quatro provas (IDs 4, 5, 7 e 8)
têm título mencionando SEPROD e campo original de banca IBPTEC: o vínculo segue o
campo original, sem presumir equivalência entre as instituições. Esses registros
precisam de revisão documental. Não foram criados vínculos entre provas antigas
e concursos de notícias sem correspondência comprovada.

Backup anterior: `backup-20261018-195540-528348-fff43686.tar.gz`.
Build publicado: `3ad8e0e8-0eb8-4e11-beaf-b563a1daa2cf`.
Evidências no servidor: `/srv/conectado/operations/bancas-verification.json` e
`bancas-promotion-20261018-225538.log` no mesmo diretório. Serviços e timers
reativados, prontidão pública validada e manutenção removida.

Validação: 86 testes Django focados, 17 testes do atualizador, fluxo Playwright
de cadastro/vínculo/filtros, TypeScript, ESLint e ausência de migrações pendentes.
O teste de visibilidade foi ajustado ao formato de citação já usado pelo serviço.

O código foi publicado por overlay controlado sobre `5e50bd3`; os arquivos locais
ainda precisam acompanhar o próximo commit/push. O atualizador verifica as duas
novas migrações na origem Git antes de entrar em manutenção, impedindo publicar
uma versão que desconheça o esquema ativo.
