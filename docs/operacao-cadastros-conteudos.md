# Operação — Cadastros e conteúdos

## Antes do deploy

1. Fazer backup do banco e registrar as contagens de `Question`, `Exam`, `Concurso` e `NewsArticle`.
2. Conferir que as migrações `0002_editorial_concursos_provas`, `0003_editorial_news`, `0022_banca_catalog`, `0023_editorial_concursos_provas` e `0024_manual_question_drafts` acompanham o deploy.
3. Executar `make check`, `make typecheck` e os testes focados da área administrativa.
4. Conferir que não há arquivos `.env`, bancos locais ou chaves no conjunto de alterações.

## Deploy

1. Colocar a aplicação em manutenção somente se o procedimento atual exigir.
2. Aplicar migrações: `cd backend && .venv/bin/python manage.py migrate`.
3. Reiniciar os processos web e workers conforme a infraestrutura.
4. Configurar uma execução recorrente do comando abaixo (por exemplo, uma vez por minuto) para artigos agendados:

```bash
cd backend && .venv/bin/python manage.py publish_scheduled_news
```

5. Verificar, com um usuário staff, as telas `/admin/cadastros`, `/admin/bancas`, `/admin/concursos`, `/admin/provas`, `/admin/questoes` e `/admin/artigos`.

## Validação após deploy

- Criar uma banca de teste e um alias; confirmar normalização sem modificar dados antigos.
- Criar um concurso manual e associar uma prova.
- Salvar uma questão manual como rascunho e enviá-la à fila; confirmar que não aparece publicamente antes da aprovação.
- Criar um artigo em rascunho, publicar um artigo e agendar outro.
- Confirmar que a edição de um concurso/notícia importado continua bloqueada.

## Rollback

- Se houver falha de aplicação, primeiro desabilitar as novas rotas/telas ou retornar a versão anterior do código; não apagar registros manualmente.
- Restaurar o backup apenas se a migração ou os dados forem comprometidos.
- As migrações são aditivas e não fazem backfill nem exclusão de dados existentes.
- Interromper o agendador de artigos antes de retornar a uma versão que não conheça os estados editoriais.


## Permissões administrativas

Os endpoints do backoffice exigem usuário ativo e `is_staff`. As escritas são
controladas pelos grupos `Administrador`, `Editor` e `Revisor`:

| Operação | Staff sem papel | Editor | Revisor | Administrador | Superusuário |
| --- | --- | --- | --- | --- | --- |
| Ler cadastros editoriais | sim | sim | sim | sim | sim |
| Editar cadastros e questões manuais | não | sim | não | sim | sim |
| Enviar, aprovar, rejeitar e publicar questões | não | não | sim | sim | sim |
| Criar/editar rascunho de campanha | não | sim | não | sim | sim |
| Publicar, encerrar e arquivar campanha | não | não | não | sim | sim |
| Gerir usuários, planos e backups | não | não | não | sim | sim |
| Consultar/exportar auditoria completa | não | não | não | não | sim |
| Gerir staff e papéis | não | não | não | não | sim |

Papéis são cumulativos. Não existe fallback administrativo para staff sem grupo.
A migração histórica `0003_create_backoffice_roles` preservou os staffs existentes
no grupo Administrador; novos acessos devem receber papel explicitamente.
Diagnóstico possui ainda a permissão adicional descrita em `operacao-diagnostico.md`.
Os relatórios financeiros mantêm a checagem separada de `view_financial_reports`.

Autores de campanhas consultam apenas id, nome de usuário e e-mail de destinatários
ativos em `/api/backoffice/notifications/options/`, sem acesso ao cadastro completo
de usuários. Essa consulta fornece também os nomes dos planos ativos.
