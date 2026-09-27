# Plano — Acervo de provas oficiais e download assistido

## Objetivo

Separar a importação de questões do acervo documental: **Fontes de questões**
permanece com importação manual e QAPI; **Acervo de provas oficiais** permite
encontrar, conferir e baixar manualmente prova, gabarito e metadados de CNU, PF,
ENEM e ENADE. Nenhum PDF vira questão automaticamente nesta iniciativa.

## Organização do admin

```
Operação
├─ Fontes de questões      manual + QAPI; busca cria fila de revisão
├─ Fila de revisão         aprova/rejeita questões já importadas
└─ Acervo de provas        descoberta, links oficiais, downloads e triagem manual
   ├─ Catálogos oficiais   CNU, PF, ENEM, ENADE
   ├─ Itens baixados       prova/gabarito, checksum e status
   └─ Preparar importação  gera pacote para revisão humana, sem publicar
```

## Regras inegociáveis

- URLs só de domínios oficiais previamente cadastrados; sem scraping de bancos
  comerciais e sem autenticação de terceiros.
- Download é iniciado por staff e gera auditoria: portal, URL final, data, hash,
  tamanho, operador e resultado HTTP.
- PDF é arquivo documental. Extração/OCR só vira sugestão para operador; nunca
  cria `Question` automaticamente.
- Prova e gabarito ficam associados ao mesmo item, mas podem ser baixados em
  momentos diferentes.
- Antes de distribuir ou importar conteúdo, registrar licença/permissão da fonte.

## Fase 1 — Limpeza e modelo de domínio

1. Manter em `QuestionSource` somente `manual`/envio local e `qapi`.
2. Remover CNU, PF, ENEM, ENADE e eduCAPES do catálogo de **Fontes de questões**
   (somente se não possuírem questões ou execuções relacionadas).
3. Criar `OfficialExamPortal`: slug, nome, domínio permitido, URL de catálogo,
   notas de licença, ativo e método de descoberta.
4. Criar `OfficialExamDocument`: portal, título, órgão/banca, cargo, ano, tipo
   (`PROVA`, `GABARITO_PRELIMINAR`, `GABARITO_FINAL`), URL de origem, URL final,
   status e relação opcional com a prova correspondente.
5. Criar `OfficialExamDownload`: documento, arquivo, SHA-256, bytes, HTTP,
   iniciado por, início/fim, erro seguro e retenção.

Critérios: migração reversível; constraints contra duplicação por portal+URL;
nenhum segredo ou arquivo binário no Git.

## Fase 2 — Conectores de descoberta

Implementar um conector por portal, sempre limitado à página oficial:

1. CNU/MGI — cadernos e gabaritos do portal oficial.
2. Polícia Federal — provas/gabaritos em página institucional.
3. INEP ENEM — provas e gabaritos.
4. INEP ENADE — provas e gabaritos.

Cada conector devolve apenas metadados e links candidatos. A tela mostra prévia
antes de salvar: título, ano detectado, tipo, URL, origem e avisos. Links fora do
domínio permitido, redirecionamento inseguro, HTML no lugar de PDF, arquivo grande
demais e duplicata recebem erro acionável, sem baixar nada.

## Fase 3 — Tela Acervo de provas

- Página de catálogo com cards de CNU, PF, ENEM e ENADE, última consulta e botão
  “Pesquisar documentos”.
- Resultado separado em **Provas**, **Gabaritos** e **Pendências de pareamento**.
- Filtros: portal, ano, órgão/banca, cargo, tipo e status.
- Ações distintas: salvar referência, baixar, associar prova+gabarito, abrir origem
  e descartar referência. Nunca usar “importar questões” nesta tela.
- Status claros: Descoberto, Aguardando conferência, Baixando, Baixado, Falhou,
  Gabarito pendente, Pronto para preparação manual.

## Fase 4 — Download seguro e operação manual

- `POST` assíncrono por item, idempotente, com lock contra dois downloads.
- Timeout, limite de tamanho, allowlist de MIME (`application/pdf`), checksum e
  armazenamento fora da área pública.
- Repetir download só com confirmação; preservar a versão anterior e auditoria.
- Página de detalhe mostra a origem, hash, evento e botão de download staff-only.
- Exportar um pacote manual (metadados + links/arquivos) para a equipe preparar
  CSV/JSON/XML que entra pela fonte manual e segue a fila existente.

## Fase 5 — Qualidade, segurança e observabilidade

- Testes de parser por portal com HTML salvo como fixture; teste de URL maliciosa,
  redirect, MIME incorreto, duplicata, timeout e associação de gabarito.
- Rate limit por portal e histórico de falhas; sem agendamento automático inicial.
- Métricas: documentos descobertos, baixados, falhas e tempo de download.
- Manual operacional descrevendo revisão jurídica e o caminho PDF → preparação
  manual → fonte manual → fila de revisão.

## Ordem de entrega

1. Fase 1 + menu/rotas vazias.
2. Fase 3 com cadastro manual de URLs e download seguro (valor imediato).
3. Conector CNU como piloto; depois PF, ENEM e ENADE.
4. Pareamento e exportação manual.
5. Observabilidade e endurecimento.

## Fora de escopo

- OCR, reconhecimento automático de alternativas/gabarito e criação automática de
  questões.
- Scraping de plataformas comerciais, redistribuição sem licença e sincronização
  periódica sem aprovação humana.
