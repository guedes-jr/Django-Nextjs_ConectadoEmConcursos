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

## Fase 1 — Limpeza e modelo de domínio — concluída

1. [x] Manter em `QuestionSource` somente `manual`/envio local e `qapi`.
2. [x] Remover CNU, PF, ENEM, ENADE e eduCAPES do catálogo de **Fontes de questões**
   (somente se não possuírem questões ou execuções relacionadas).
3. [x] Criar `OfficialExamPortal`: slug, nome, domínio permitido, URL de catálogo,
   notas de licença, ativo e método de descoberta.
4. [x] Criar `OfficialExamDocument`: portal, título, órgão/banca, cargo, ano, tipo
   (`PROVA`, `GABARITO_PRELIMINAR`, `GABARITO_FINAL`), URL de origem,
   status e relação opcional com a prova correspondente.
   - [x] Registrar a URL final após redirecionamento seguro (por tentativa de download).
5. [x] Criar `OfficialExamDownload`: documento, arquivo, SHA-256, bytes, HTTP,
   iniciado por, início/fim, erro seguro e retenção.

Critérios: migração reversível; constraints contra duplicação por portal+URL;
nenhum segredo ou arquivo binário no Git.

## Fase 2 — Conectores de descoberta — concluída

Status: [x] descoberta genérica limitada à allowlist de domínios oficiais, classificação básica de prova/gabarito e prévia antes de salvar; [x] conectores dedicados CNU, PF, ENEM e ENADE.

Implementar um conector por portal, sempre limitado à página oficial:

1. [x] CNU/MGI — cadernos e gabaritos do portal oficial (blocos temáticos, gabaritos e metadados dedicados).
2. [x] Polícia Federal — provas/gabaritos em página institucional (metadados dedicados de órgão e cargo).
3. [x] INEP ENEM — provas e gabaritos (metadados dedicados do INEP e dia de aplicação).
4. [x] INEP ENADE — provas e gabaritos (metadados dedicados do INEP e curso/área).

Cada conector devolve apenas metadados e links candidatos. A tela mostra prévia
antes de salvar: título, ano detectado, tipo, URL, origem e avisos. Links fora do
domínio permitido, redirecionamento inseguro, HTML no lugar de PDF, arquivo grande
demais e duplicata recebem erro acionável, sem baixar nada.

## Fase 3 — Tela Acervo de provas — parcial

- [x] Página de catálogo com cards de CNU, PF, ENEM e ENADE e botão
  “Pesquisar documentos”.
- [x] Resultado separado em **Provas**, **Gabaritos** e **Pendências de pareamento**.
- [x] Filtros: portal, ano, órgão/banca, cargo, tipo e status.
- [x] Ações distintas: salvar referência, baixar, associar prova+gabarito, abrir origem
  e descartar referência. Nunca usar “importar questões” nesta tela.
- [x] Status claros de descoberta, conferência, download concluído e falha.
  - [x] Estados derivados “Gabarito pendente” e “Pronto para preparação manual”.

## Fase 4 — Download seguro e operação manual — parcial

- [x] `POST` assíncrono por item via django-q; [x] lock contra dois downloads.
  - Deploy: manter o processo `manage.py qcluster` ativo para consumir a fila.
- [x] Timeout, limite de tamanho, allowlist de MIME (`application/pdf`) e checksum.
  - [x] Armazenamento privado fora da área pública (migration de cópia não destrutiva).
- [x] Repetir download só com confirmação; [x] preservar execuções anteriores e auditoria.
- [x] Página de detalhe mostra a origem, URL final, hash e histórico de eventos.
  - [x] Botão staff-only para baixar o PDF privado.
- [x] Exportar um pacote manual de metadados e links (JSON) para a equipe preparar
  CSV/JSON/XML que entra pela fonte manual e segue a fila existente.
  - [ ] Incluir os arquivos privados no pacote — bloqueado até autorização jurídica explícita para distribuição.

## Fase 5 — Qualidade, segurança e observabilidade — parcial

- [x] Testes de parser dos conectores oficiais e de download: redirect fora da allowlist, MIME incorreto, arquivo PDF válido e bloqueio de download paralelo.
  - [x] Fixtures HTML versionadas para CNU, PF, ENEM e ENADE.
- [x] Rate limit configurável por portal e histórico de falhas; sem agendamento automático inicial.
- [x] Métricas: documentos descobertos, baixados, falhas, downloads em processamento e tempo médio de download.
- [x] Manual operacional de revisão jurídica e do caminho PDF → preparação
  manual → fonte manual → fila de revisão: `docs/operacao-acervo-provas.md`.

## Ordem de entrega e status

1. [x] Fase 1 + menu/rotas vazias.
2. [x] Fase 3 com cadastro manual de URLs e download seguro (valor imediato).
3. [x] Conector CNU como piloto; depois PF, ENEM e ENADE.
4. [x] Pareamento e exportação manual de metadados.
5. [x] Observabilidade e endurecimento (pendências de testes adicionais permanecem na Fase 5).

## Fora de escopo

- OCR, reconhecimento automático de alternativas/gabarito e criação automática de
  questões.
- Scraping de plataformas comerciais, redistribuição sem licença e sincronização
  periódica sem aprovação humana.
