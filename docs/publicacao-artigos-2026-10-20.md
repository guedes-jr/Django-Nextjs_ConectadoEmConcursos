# Importação dos artigos em produção — 20/10/2026

Release: `/srv/conectado/releases/20261020T121635Z-da0a083bb99e-articles-csv`.
Build: `b139ec75-adfb-49fe-b28e-a9650f9efaca`.

Foram importados e publicados 77 artigos do CSV fornecido pelo administrador, com 20 destaques. Categorias de navegação: Português (61), Direito Administrativo (7), Direito Constitucional (5) e Conhecimentos Gerais (4). Os dois títulos iguais foram preservados com IDs e slugs distintos, pois os conteúdos são diferentes.

O hash SHA-256 do arquivo importado é `2f10cbfb09edc9e63fd4334ae58cd0726c98ae3e2c066f9b1ec2716ef4f68663`. Todos os corpos foram confrontados integralmente com o CSV, incluindo as imagens incorporadas. Metadados originais, autoria, etiquetas, datas, destaque e publicação foram preservados. A migração `concursos.0011_newsarticle_source_metadata` permite guardar os campos do arquivo sem criar autores ou visualizações fictícios.

A listagem pública dos 77 itens foi validada com 44.455 bytes, sem transportar o corpo completo. A leitura individual foi verificada como usuário comum, incluindo os conteúdos de 2.392.213 e 6.930.522 caracteres. A conferência da rota de leitura suprimiu apenas a criação de telemetria no processo de teste. As 450 notícias automáticas permaneceram separadas e preservadas.

Validação: 13 testes Django focados, teste de navegação Playwright com conta comum, TypeScript, ESLint, ausência de migrações pendentes, build de produção, ensaio da migração e importação no banco clonado. A reexecução do lote manteve 77 registros sem duplicações. A comparação dos registros históricos em 15 tabelas confirmou sua preservação. Nenhuma questão foi alterada ou aprovada.

Backup anterior: `backup-20261020-092046-855225-ae97ec33.tar.gz`. Backup posterior com o material importado: `backup-20261020-092215-123412-2718f532.tar.gz`, protegido com modo 600. Backend, frontend, worker e dois timers ativos; prontidão HTTPS 200 e manutenção removida.

Evidências em `/srv/conectado/operations/`: `articles-csv-shadow-report.json`, `articles-csv-before.json`, `articles-csv-verification.json`, `articles-csv-import-history.json`, `articles-csv-import-verification.json`, `articles-csv-final-report.json` e `articles-csv-promotion-20261020-122044.log`.

A publicação usa overlay de 24 arquivos sobre `da0a083bb99eb0007a969671e6d8fa41cfb1894d`, preservando a correção anterior dos textos de apoio e contadores. O atualizador exige as sete migrações da release. O CSV original permaneceu intacto e fora do Git. README e demais alterações do usuário foram preservados; as mudanças locais seguem disponíveis para o próximo commit/push.
