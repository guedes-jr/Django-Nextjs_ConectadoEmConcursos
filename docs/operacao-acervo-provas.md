# Operação do acervo de provas oficiais

## Finalidade e limites

O Acervo de Provas serve para localizar, conferir, baixar e preparar documentos
oficiais. Um PDF **não** cria questões automaticamente. OCR, extração de
alternativas e publicação direta permanecem fora do escopo.

Use apenas os portais cadastrados (CNU, PF, ENEM e ENADE) e URLs nos domínios
permitidos. Não inclua conteúdo de plataformas comerciais, cópias não oficiais ou
materiais sem licença/permissão de uso registrada.

## Fluxo operacional

1. No admin, abra **Acervo de provas oficiais** e escolha o portal.
2. Use **Pesquisar documentos**. Revise a prévia: título, ano, tipo, URL e indicação
   de registro existente.
3. Confirme **Salvar novas referências** apenas para links oficiais pertinentes.
4. Complete ou corrija órgão/banca, cargo/curso e ano quando necessário.
5. Associe cada prova ao respectivo gabarito. A aba **Pendências** mostra provas sem
   gabarito; só o conjunto baixado aparece como pronto para preparação manual.
6. Inicie o download. Ele é enfileirado, pode ser acompanhado em **Detalhes** e só
   pode ser repetido após confirmação explícita.
7. Confira URL final, HTTP, tamanho, SHA-256 e eventuais erros. Use **Arquivo** para
   baixar o PDF privado como staff, quando necessário.
8. Exporte o pacote manual JSON aplicando os filtros desejados.
9. A equipe prepara CSV, JSON ou XML das questões a partir de uma fonte autorizada e
   usa a fonte manual. As questões seguem para a fila de revisão; não devem ser
   publicadas diretamente.

## Revisão jurídica e de qualidade

Antes de preparar ou distribuir conteúdo, registre internamente:

- órgão/portal de origem e URL oficial;
- licença, edital, termo de uso ou autorização aplicável;
- finalidade do uso e responsável pela revisão;
- data da conferência e eventuais restrições de redistribuição.

Interrompa o fluxo se houver divergência entre prova e gabarito, URL fora da
allowlist, conteúdo HTML no lugar de PDF, documento sem origem comprovada ou dúvida
sobre direitos. Preserve a auditoria e descarte somente referências sem download.

## Segurança e operação técnica

- PDFs ficam em `OFFICIAL_EXAMS_ROOT`, fora da mídia pública.
- A conta do serviço precisa ter leitura/escrita nesse diretório.
- O worker `python manage.py qcluster` deve ficar ativo em produção para processar
  downloads enfileirados.
- O limite padrão é 10 downloads por portal a cada hora; ajuste somente por variáveis
  `OFFICIAL_EXAM_DOWNLOAD_LIMIT` e `OFFICIAL_EXAM_DOWNLOAD_WINDOW_SECONDS`.
- A página mostra downloads concluídos, em andamento, falhos e tempo médio. Investigue
  falhas repetidas antes de aumentar limites ou repetir downloads.

## Incidentes

- **Fila parada:** confirme o processo `qcluster`, Redis e permissões do storage.
- **Falha de domínio/MIME:** não altere a allowlist sem conferir a origem institucional.
- **Arquivo privado indisponível:** mantenha a tentativa para auditoria e verifique o
  storage; não exponha a pasta privada via Nginx ou `MEDIA_URL`.
- **Rate limit atingido:** aguarde a janela expirar; não dispare repetições em massa.
