# Publicação em produção — 20/10/2026

- Release: `/srv/conectado/releases/20261020T120308Z-da0a083bb99e-text-preview`.
- Build: `32643071-9902-4fcb-864a-deaacb491e43`.
- Backup anterior à atualização: `backup-20261020-090657-501329-885f2304.tar.gz`.
- Base Git: `da0a083bb99eb0007a969671e6d8fa41cfb1894d`, com overlay verificado de 16 arquivos.

Textos de apoio mostram uma prévia de até três linhas e controles de expandir/minimizar no início e fim da leitura. A minimização mantém o foco de teclado no controle principal. O comportamento é compartilhado por questões, simulados e administração.

As provas e os cargos dos concursos passam a informar a quantidade de questões em revisão separadamente das aprovadas para resolução. A consulta administrativa ganhou filtros por prova e fonte, além de identificação da prova e número original na linha da questão.

A verificação em produção confirmou os cadastros existentes: prova 14 com 40 questões pendentes, prova 15 com 59, prova 16 com 60 e prova 17 com 40. Total: 199 questões vinculadas, ainda sem aprovação para resolução. A consulta administrativa por prova/fonte retorna essas quantidades; a consulta do aluno permanece restrita às aprovadas.

Não houve reimportação, mudança de vínculos, publicação automática, migração adicional ou alteração de textos armazenados. Os hashes dos dados históricos permaneceram iguais, e a integridade do banco foi confirmada.

Validação: 48 testes Django focados, TypeScript e Playwright com prévia, expansão, minimização pelo fim, foco de teclado e limite de três linhas em celular. ESLint sem erros; permanece o aviso anterior de dependência de efeito em `frontend/app/(protected)/questions/page.tsx`. Build de produção e ensaio de migração aprovados. Backend, frontend, worker e dois timers ativos; HTTPS de prontidão 200 e manutenção removida.

Evidências em `/srv/conectado/operations/`: `text-preview-before.json`, `text-preview-verification.json`, `text-preview-api-verification.json` e `text-preview-promotion-20261020-120652.log`.

As alterações locais de README foram preservadas e excluídas do pacote. As mudanças desta correção permanecem no workspace para o próximo commit/push.
