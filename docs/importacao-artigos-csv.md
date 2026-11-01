# Importação dos artigos em CSV

O comando `import_articles_csv arquivo.csv` valida e simula; `--apply` grava. Os artigos recebem origem editorial manual para aparecerem em `/artigos`, separadamente de `/noticias`. A identidade usa a origem `articles_csv` e o ID original; títulos iguais com IDs distintos são preservados. Uma reexecução mantém registros idênticos e rejeita sobrescritas de artigos alterados.

O corpo HTML permanece integral, incluindo imagens incorporadas. A listagem pública retorna resumos e metadados, deixando o corpo completo para a leitura individual. A apresentação utiliza a renderização sanitizada já existente. Autoria textual e tempo de leitura informados no arquivo aparecem no detalhe, sem criar contas fictícias de autores.

Disciplina é usada como categoria de navegação. Categoria original, tópico, etiquetas, autoria, tempo de leitura, ordenação, contagem histórica de visualizações, datas originais e demais colunas são preservados em `source_metadata`. Visualizações históricas não são convertidas em acessos fictícios. Datas sem fuso explícito são interpretadas como UTC, mantendo-se a representação original nos metadados. Resumos vazios recebem uma prévia textual; artigos somente com imagens podem permanecer sem resumo.

A importação respeita os indicadores de publicado e destaque do CSV, usa transação, bloqueio compartilhado com backups e auditoria sem copiar os corpos para os eventos. O arquivo original e as cópias operacionais permanecem fora do Git.

O lote fornecido em 20/10/2026 contém 77 artigos, todos publicados no arquivo e 20 em destaque. A composição é de 61 materiais de Português, 7 de Direito Administrativo, 5 de Direito Constitucional e 4 de Conhecimentos Gerais. Há dois artigos intitulados “Uso dos porquês”, com conteúdos distintos.
