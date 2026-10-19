# Provas de 2010 e documentos por cargo

O concurso concentra edital, documentos gerais e gabaritos que reúnem vários cargos. Cada prova representa um cargo e recebe seu caderno e os gabaritos individuais. Na página do cargo, os documentos próprios e os gerais aparecem em seções separadas.

## Envio pela administração

Em Concursos → Materiais → Enviar arquivo PDF, selecione até 20 arquivos, de até 25 MB cada. Confira título, tipo e cargo em cada linha. Para edital ou gabarito geral, mantenha “Geral do concurso”. O status de publicação se aplica aos arquivos selecionados.

O envio é sequencial, com progresso. Se falhar, os arquivos concluídos continuam salvos e saem da fila; os restantes podem ser reenviados. Cada PDF usa o mesmo controle de acesso, validação e armazenamento privado dos envios individuais. A edição continua substituindo um único arquivo por vez.

O tipo “Gabarito” permite preservar documentos cuja versão não está identificada; não rotulá-los como definitivos sem evidência.

## Lote fornecido pelo administrador

| Concurso | Cargo | Banca | PDFs | Questões para revisão |
| --- | --- | --- | ---: | ---: |
| Avelino Lopes, edital 001/2009 | Vigia, prova de 2010 | CONSEP | 3 | 40 |
| DETRAN/RN, edital 001/2010 | Vistoriador/Emplacador — Inspeção Veicular, tipo 1 branco | FGV | 5 | 59 |
| DETRAN/SE, concurso 2009/2010 | Vistoriador de Trânsito — VT2, tipo V | FUNCAB | 4 | 60 |
| Piracuruca, concurso 2010 | Veterinário, tipo 1 | IVIN | 3 | 40 |

Os gabaritos FGV e IVIN são gerais. Os de Vigia e FUNCAB pertencem aos respectivos cargos. A questão 15 da FGV foi anulada no gabarito definitivo e está preservada no PDF, sem resposta pontuável inventada. Os documentos do ZIP são cadastrados como PDFs individuais; os originais locais permanecem intactos.

As 199 questões entram pendentes, nunca aprovadas automaticamente. As transcrições por OCR precisam de conferência editorial; páginas originais preservam os textos-base, figuras e a referência visual no vínculo de apoio. Não foram produzidos comentários artificiais. Os materiais e as provas podem ser publicados enquanto o simulado aguarda questões aprovadas.

## Comando operacional

`backend/manage.py import_exam_bundle /caminho/manifest.json` valida sem cadastrar conteúdo. `--apply` grava o lote, com bloqueio compartilhado com backups, transação, limpeza de arquivos em falha e auditoria. PDFs exigem SHA-256 correspondente ao manifesto. Os arquivos devem estar na pasta do manifesto ou em suas subpastas.

Reexecutar o lote preserva questões revisadas e evita duplicar provas e PDFs. O manifesto usa chaves estáveis para concurso, prova e número de questão. Enunciados genéricos iguais, como “Marque a afirmativa INCORRETA”, não identificam uma questão por si só; este cadastro usa o identificador externo e mantém a verificação de duplicatas pelo conteúdo.

Os PDFs, imagens de apoio, manifesto e banco de validação ficam fora do Git. A importação foi solicitada expressamente pelo administrador.
