# Banco, mídia e e-mail — etapa 7

A implementação prepara a operação com PostgreSQL, mídia local persistente e SMTP.
Nenhum banco operacional, mount, proxy, credencial ou provedor foi alterado. Não
houve execução de backup/restauração de produção nem envio de e-mail real.

## Backup e restauração

`manage.py backup_db` escolhe o motor de `DATABASES.default`:

- SQLite usa a API de backup online e recusa origem inexistente, sem criar banco vazio.
- PostgreSQL usa `PG_DUMP_BIN` em formato custom. Instalar previamente clientes
  compatíveis com o servidor e configurar DB_NAME/USER/PASSWORD/HOST/PORT. Não são
  instalados pelo projeto. DB_NAME deve ser um nome, não uma URL de conexão.
- `DB_SSLMODE` é repassado ao Django e ao cliente. O adaptador também reconhece
  sslrootcert, sslcert, sslkey, connect_timeout e options quando configurados em
  DATABASES.default. Outras opções são rejeitadas para evitar destino ambíguo.
- A senha fica em PGPASSFILE temporário privado, removido ao terminar. Não aparece
  em argumentos, respostas, auditoria ou stderr devolvido à API. Comandos têm
  timeout, conexão limitada e não usam shell.
- O arquivo final só aparece após concluir a compactação, com permissão 0600,
  nome único e manifesto de versão, motor e SHA-256 do banco. O manifesto detecta
  corrupção, mas não autentica a procedência: restaurar apenas cópias confiáveis.
- Inclui banco, MEDIA_ROOT (inclusive vazio) e os PDFs enviados aos concursos,
  em `OFFICIAL_EXAMS_ROOT/concurso-materials`, como `concurso-files/` no arquivo.
  Não inclui .env, chaves, código, Redis, roles globais PostgreSQL nem os demais
  documentos do acervo em OFFICIAL_EXAMS_ROOT. Esses documentos ainda precisam
  de snapshot próprio associado à mesma janela. Os uploads de concursos usam
  o mesmo lock dos backups para manter arquivos e vínculos consistentes.
- BACKUP_DIR deve ser persistente e privado, fora da mídia pública. BACKUP_KEEP
  mantém os últimos arquivos normais; cópias pré-restauração são preservadas para
  recuperação manual e precisam de retenção operacional separada.
- Um lock local impede operações simultâneas no mesmo diretório. Para múltiplos
  hosts, usar um único executor; o lock não substitui coordenação distribuída.
- Limites padrão: 100 mil entradas e 10 GiB descompactados, ajustáveis. Symlinks,
  arquivos especiais, nomes duplicados, caminhos externos e motor incompatível
  são rejeitados. Permissões/ownership do arquivo tar não são aplicadas cegamente.

**PostgreSQL: restauração somente por CLI.** Parar aplicação, workers e agendadores;
reter o tráfego externo, inclusive webhooks, para que os provedores reenviem depois.
Validar o arquivo em um banco isolado, código/migrações compatíveis e espaço em disco.
Então, em janela de manutenção, executar:

```sh
cd backend
.venv/bin/python manage.py restore_db backup-NOME.tar.gz --maintenance --confirm
```

As flags declaram que o operador já parou os serviços; o comando não administra os
processos. A API web não recebe essa autorização e a interface desabilita a ação
para PostgreSQL. `pg_restore --list` valida a estrutura antes das mudanças; um dump
atual é preservado em `before-restore-*.dump`, depois a restauração usa limpeza,
transação única, parada no primeiro erro e exclusão de ownership/ACL de origem.
O usuário precisa ser proprietário dos objetos; roles/DB devem existir no destino.
Se uma falha ocorrer durante a transação, a mídia não é trocada.

A mídia é preparada em staging no mesmo filesystem do destino antes de alterar o
banco. Após restaurar o banco, a troca de diretório preserva a mídia anterior em
`.before-restore-media-*`. Se falhar, a mensagem indica que o banco já foi restaurado:
manter a manutenção, preservar as cópias e recuperar o par banco/mídia antes de abrir
tráfego. Banco e filesystem não têm uma transação única. Provisionar MEDIA_ROOT como
subdiretório do volume; um mountpoint na própria raiz pode impedir renomeação.

SQLite mantém compatibilidade com os backups antigos sem manifesto. O banco anterior
fica em `.sqlite3.bak`; backups antigos sem diretório de mídia preservam a mídia atual.
Backups novos com mídia vazia restauram essa ausência, removendo os arquivos posteriores.
A restauração também reverte a auditoria no banco, como descrito em
[operação de auditoria](operacao-auditoria.md); preservar trilha externa na operação.

Um dump consistente do banco não garante consistência com arquivos alterados durante
sua cópia. Para um par exato, suspender uploads/escritas ou usar snapshots coordenados.
Para produção, completar com cópias externas protegidas, monitoramento, retenção e
estratégia de recuperação/PITR conforme RPO/RTO. O arquivo local não encerra esse aceite.

Referências: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html),
[arquivo de senha libpq](https://www.postgresql.org/docs/current/libpq-pgpass.html).

## Mídia persistente

Configurar MEDIA_ROOT, MEDIA_URL, BACKUP_DIR e OFFICIAL_EXAMS_ROOT por ambiente.
Exemplo de layout: `/srv/conectado/media`, `/srv/conectado/backups` e
`/srv/conectado/private/official-exams`. Criar diretórios/volumes com acesso de
escrita do usuário da aplicação e leitura pública somente para o proxy na mídia.
Manter esses caminhos fora das pastas de release, Git e rotinas de limpeza.

O storage é FileSystemStorage local. Não foi introduzido S3/CDN nem replicação
entre hosts; várias instâncias precisam compartilhar o volume ou adotar outro backend.
Em produção, Django não serve mídia. O exemplo
`deploy/nginx/media.conf.example` mapeia apenas `/media/`, bloqueia escrita HTTP,
listagem e symlinks e restringe conteúdo ativo. Adaptar/testar no nginx real antes
de habilitar. Nunca mapear o diretório pai dos backups ou do acervo privado.
Ver [alias do nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html#alias).

Homologar um upload, sua URL pública e a persistência após trocar/reiniciar o release.
Conferir falta de acesso a backups e arquivos privados. Validar permissões novamente
após restauração, porque a mídia nova é criada pelo usuário executor da operação.

## E-mail transacional

Configurar o backend `django.core.mail.backends.smtp.EmailBackend`, EMAIL_HOST,
EMAIL_PORT, usuário/senha e DEFAULT_FROM_EMAIL com remetente verificado.
Usar STARTTLS (`EMAIL_USE_TLS=true`) ou SSL implícito (`EMAIL_USE_SSL=true`), nunca
ambos. Timeout padrão de 15 segundos; certificados de cliente são opcionais.
Console continua sendo o padrão de desenvolvimento, não uma confirmação de entrega.

Comandos disponíveis para o operador:

```sh
# Verificação estática, incluindo volumes e transporte; sem sondagem de rede
.venv/bin/python manage.py check --deploy
.venv/bin/python manage.py check_email_delivery
# Sondagens explícitas de homologação, não executadas nesta etapa
.venv/bin/python manage.py check_email_delivery --smtp-connect
.venv/bin/python manage.py check_email_delivery --send-to destinatario-controlado@example.com
```

O último comando envia uma mensagem de teste para o destinatário informado. Aceitação
SMTP não comprova chegada na caixa: conferir recebimento, spam e autenticação do
remetente no provedor. Não publicar credenciais ou links de recuperação em logs.
Os comandos são auditados no banco; a verificação estática não conecta ao SMTP.
[Configuração de e-mail Django](https://docs.djangoproject.com/en/5.2/ref/settings/#email-timeout).

Recuperação de senha mantém a resposta genérica em falhas de transporte e registra
somente o tipo do erro. Endereços inválidos, ausentes e usuários inativos não recebem
mensagens. O envio ainda é síncrono e não possui retry/fila nesta etapa; monitorar
falhas e permitir nova solicitação. Limites antiabuso e entrega sob carga devem
acompanhar a homologação do endpoint e do proxy.

## Validação local e aceite externo

Os testes fazem roundtrip real somente com SQLite e diretórios temporários. Os
contratos de pg_dump/pg_restore, credenciais, flags transacionais e falhas usam
subprocessos simulados. SMTP também usa adaptadores simulados/locmem; não houve
contato com provedor, instalação de dependências ou nova migração.

Permanecem operacionais: provisionar volumes e clientes PostgreSQL, roundtrip real
em banco isolado, cópia externa/PITR, snapshot do acervo privado, configuração e
validação do proxy, credenciais/remetente e recebimento real de e-mail. Esses itens
não podem ser comprovados apenas por configuração no repositório.

## PDFs enviados aos concursos

Novos backups incluem `concurso_files_included: true` no manifesto e a pasta
`concurso-files/`, mesmo vazia. A extração limita tamanho/quantidade, rejeita links
e caminhos externos, e mantém arquivos privados com permissão 0600.

A restauração prepara mídia e PDFs em pastas isoladas antes de alterar o banco,
preserva as árvores anteriores e troca os diretórios no mesmo volume. Se uma
troca falhar, tenta restabelecer as árvores anteriores e informa a necessidade
de recuperação do banco; manter manutenção e escritores parados. Backups antigos
sem essa seção continuam aceitos e não alteram a pasta atual dos uploads.
