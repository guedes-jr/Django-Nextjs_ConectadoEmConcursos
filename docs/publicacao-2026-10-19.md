# Publicação em produção — 19/10/2026

Release: `/srv/conectado/releases/20261019T113508Z-5e50bd3484a0-exams-2010`.
Build: `889b67cb-97af-4c6e-8623-b7a0066f4bdc`.

Publicados: upload de vários PDFs com vínculo individual por cargo, apresentação separada de documentos gerais, separação de Artigos e Notícias e redefinição direta de senha na lista/ficha de usuários.

## Cadastro realizado

| Concurso | ID do concurso | ID da prova | Banca | PDFs | Questões pendentes |
| --- | ---: | ---: | --- | ---: | ---: |
| Avelino Lopes — Vigia | 426 | 14 | CONSEP | 3 | 40 |
| DETRAN/RN — Inspeção Veicular | 427 | 15 | FGV | 5 | 59 |
| DETRAN/SE — Vistoriador de Trânsito | 428 | 16 | FUNCAB | 4 | 60 |
| Piracuruca — Veterinário | 429 | 17 | IVIN | 3 | 40 |

CONSEP, FUNCAB e IVIN foram cadastradas quando ausentes; FGV foi reutilizada. Os editais de 2009 que correspondem às provas de 2010 conservaram essa identificação. Todos os concursos históricos estão encerrados. Nenhuma questão foi aprovada automaticamente; a questão anulada da FGV permanece no documento original, fora das questões pontuáveis.

O cadastro foi ensaiado numa cópia do banco operacional com armazenamento temporário. A reexecução manteve as 199 questões e os 15 PDFs sem duplicação. Depois da migração, uma comparação de hashes confirmou a preservação dos registros históricos em 14 tabelas, incluindo usuários e senhas. Nenhuma senha real foi alterada para testar a nova ação administrativa.

## Verificação e recuperação

- 43 testes Django focados aprovados, além de TypeScript, ESLint e verificação de migrações.
- Navegação: upload individual, envio múltiplo por cargo e redefinição de senha com invalidação do acesso anterior aprovados em Playwright, com banco temporário.
- Os 15 downloads foram verificados como usuário comum, com SHA-256 correspondente ao arquivo original e sem acesso aos documentos de outro cargo.
- Artigos: 0 publicações manuais; Notícias: 450 importadas, em listas separadas.
- HTTPS de prontidão: 200; nova rota protegida de artigos: redirecionamento para login.
- Backend, frontend, worker e dois timers ativos; manutenção removida.
- Backup anterior ao cadastro: `backup-20261019-083923-892398-12bc156e.tar.gz`.
- Backup posterior: `backup-20261019-090906-710390-80047163.tar.gz`, com os 15 PDFs em `concurso-files/` e modo 600.

Evidências em `/srv/conectado/operations/`: `exams-2010-shadow-report.json`, `exams-2010-before.json`, `exams-2010-verification.json`, `exams-2010-import-history.json`, `exams-2010-api-verification.json`, `exams-2010-final-report.json` e `exams-2010-promotion-20261019-113917.log`.

A publicação utiliza overlay com manifesto de 104 arquivos sobre `5e50bd3484a0f23f95f8f330ba18a207e812eac6`. O atualizador preserva a exigência das seis migrações presentes na release. Os PDFs, manifesto de importação, imagens extraídas e banco de ensaio não foram adicionados ao Git; os arquivos originais locais não foram alterados. As mudanças de código permanecem no workspace para o próximo commit/push.
