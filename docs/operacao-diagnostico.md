# Operação do diagnóstico

A área `/admin/diagnostico` exige `DIAGNOSTICS_ENABLED=1`, usuário ativo staff e
superusuário, e concessão explícita de `backoffice.access_diagnostics`. O acesso
implícito a todas as permissões do superusuário não substitui a concessão.
Atribua a permissão diretamente ou por grupo no Admin Django após aplicar a
migração `backoffice.0011_alter_auditevent_options` da etapa 1.

A etapa 4 não cria novas migrações nem instala dependências. Não altera processos,
serviços ou arquivos operacionais. Toda consulta usa coleta manual e limites.

## Configuração e limites

| Variável | Padrão | Limite aplicado |
| --- | --- | --- |
| `DIAGNOSTICS_ENABLED` | `0` | precisa ser `1` para habilitar |
| `APP_VERSION` | vazio | versão de release informada pelo deploy |
| `DIAGNOSTICS_LOG_FILES` | vazio | arquivos explícitos, separados por vírgula |
| `DIAGNOSTICS_LOG_MAX_BYTES` | `1048576` | 4 KiB a 4 MiB por janela |
| `DIAGNOSTICS_LOG_MAX_LINES` | `5000` | 100 a 10000 linhas por janela |
| `DIAGNOSTICS_LOG_EXPORT_LINES` | `500` | 1 a 1000 linhas por download |
| `DIAGNOSTICS_LOG_EXPORT_MAX_BYTES` | `262144` | 4 KiB a 1 MiB por download |
| `DIAGNOSTICS_QUERY_TIMEOUT_MS` | `3000` | 100 a 10000 ms de orçamento das consultas |
| `DIAGNOSTICS_RESULT_MAX_BYTES` | `32768` | 1 KiB a 64 KiB de resultado |
| `DIAGNOSTICS_REQUESTS_PER_MINUTE` | `60` | 1 a 600 consultas por usuário/minuto |
| `DIAGNOSTICS_ROUTINES_PER_MINUTE` | `6` | 1 a 30 execuções por usuário/minuto |
| `DIAGNOSTICS_HEALTH_FILE` | vazio | snapshot JSON fornecido pela infraestrutura |
| `DIAGNOSTICS_HEALTH_MAX_AGE_SECONDS` | `300` | 10 a 3600 segundos de validade |
| `DIAGNOSTICS_SLOW_QUERY_STATS` | `0` | `1` habilita leitura de agregados PostgreSQL |

O controle de frequência usa o cache padrão do Django. Em implantação com vários
processos, configure esse cache em armazenamento compartilhado para uma cota
comum entre os processos. Cache local aplica a cota por processo. `429` informa
`Retry-After`; consultas e rotinas possuem cotas separadas.

## Logs permitidos

Exemplo de configuração:

```env
DIAGNOSTICS_LOG_FILES=/srv/conectado/logs/django.log,/srv/conectado/logs/worker.log
```

Use arquivos regulares, com acesso de leitura pelo processo Django. Links simbólicos,
FIFOs e dispositivos não são aceitos. O navegador recebe identificadores opacos e
o nome do arquivo; não recebe nem escolhe caminhos. Arquivos com o mesmo nome têm
identificadores diferentes. A allowlist deve conter somente logs apropriados à
consulta administrativa, nunca arquivos de ambiente, chaves ou bancos.

A leitura considera o fim do arquivo, limitada pelos bytes e linhas configurados.
Cada linha tem no máximo 2.000 caracteres de saída; linhas acima de 8 KiB são
omitidas integralmente. Não é um mecanismo de busca em todo o histórico do servidor.
A tela informa quando a janela é limitada.

A paginação usa snapshot assinado, válido por cinco minutos, com identidade do
arquivo e hash da janela. Novas linhas não mudam as páginas já abertas. Rotação,
truncamento ou alteração dos bytes da janela exigem atualizar a primeira página.
A requisição de cada página lê somente a janela limitada, sem `readlines()` do
arquivo inteiro. O download TXT usa os mesmos filtros e snapshot, com limites
adicionais de linhas e bytes; não exporta todo o arquivo.

Filtros disponíveis:

- texto, aplicado sobre conteúdo já redigido;
- severidade exata: DEBUG, INFO, WARNING, ERROR e CRITICAL;
- período, no horário local da tela, enviado com fuso explícito;
- correlação exata por request ID.

São reconhecidos JSON por linha com `timestamp`/`time`/`asctime`/`created_at`,
`level`/`levelname`/`severity`, `request_id`/`correlation_id` e texto convencional
com data ISO e severidade. `WARN` e `FATAL` são normalizados. Linhas sem data
reconhecida continuam pesquisáveis por texto, mas não entram em filtros de período.

A redação cobre chaves de credenciais em JSON e padrões comuns em texto/cabeçalhos.
Ela não substitui a política de não registrar segredos na origem. Consultas,
listagem e downloads geram auditoria sem copiar linhas, termos de busca ou IDs de
correlação pesquisados para o contexto do evento. Respostas não são cacheadas.

## Rotinas internas — decisão de escopo da etapa 4

A aba oferece apenas duas consultas fixas, versionadas e revisadas:

- Contagens resumidas: usuários, assinaturas ativas, questões pendentes e auditoria.
- Falhas recentes: até 50 eventos, com identificador, ação, recurso e horário.

O formulário aceita somente o identificador da rotina; código, SQL, parâmetros,
rede e subprocessos não são fornecidos pelo navegador. A execução é síncrona e
curta, com orçamento de consultas e saída limitada. Não há executor genérico,
fila de scripts nem cancelamento manual: o timeout encerra a consulta cara. Uma
expansão futura para tarefas arbitrárias/longas exige outro desenho e aceite;
esses recursos foram retirados do escopo atual em favor do catálogo fixo.

No SQLite, `query_only` bloqueia escrita e um progress handler interrompe consultas
caras; o estado da conexão é restaurado mesmo após erro. No PostgreSQL, a coleta
usa transação somente leitura quando inicia a transação, guardião SQL de leitura
e `statement_timeout` ajustado ao orçamento restante. Em uma transação já aberta,
o guardião restringe as consultas das rotinas fixas. Nenhuma dessas proteções deve
ser tratada como sandbox para executar código não confiável.

A limitação de memória vem das consultas agregadas, da lista de até 50 falhas e
dos limites de janela/saída; não altera limites de memória do processo web. Saída
excessiva é substituída por uma mensagem de truncamento antes de ser auditada.
Cada execução registra ator, hash SHA-256 do código da rotina, duração e resultado
redigido. Falhas registram somente a classe do erro e o hash. Se o banco não puder
persistir a falha, o logger informa isso sem copiar a mensagem original.

## Banco e capacidade

A coleta retorna conectividade, latência, versão, migrações pendentes e tamanho
lógico (páginas no SQLite, `pg_database_size` no PostgreSQL). Conexões PostgreSQL
são contadas somente para o banco atual. Falha/timeout retorna coleta parcial ou
indisponível, sem string de conexão ou mensagem de exceção.

Para estatísticas agregadas, habilite `DIAGNOSTICS_SLOW_QUERY_STATS=1` somente após
provisionar `pg_stat_statements` e a permissão de leitura na infraestrutura. A tela
recebe quantidade de chamadas, maior tempo médio e tempo total agregado do banco
atual; não recebe texto nem parâmetros de consultas. Ausência da extensão ou de
permissão continua indicada como indisponibilidade, sem instalar nada automaticamente.

CPU/memória do host usam `psutil` quando já disponível. Sem essa dependência, a tela
mantém os campos indisponíveis e pode mostrar o pico do processo via `resource` nos
sistemas compatíveis. Espaço de disco, carga do host e PID são coletados localmente.
A versão da aplicação precisa ser informada por `APP_VERSION` durante o deploy.

## Saúde de serviços externos

Configure `DIAGNOSTICS_HEALTH_FILE` com um arquivo JSON regular atualizado por um
coletor confiável da infraestrutura. O Django não faz requisições para destinos
recebidos pelo navegador. Exemplo de formato (substitua os horários a cada coleta):

```json
{
  "worker": {
    "status": "ok",
    "checked_at": "2026-10-18T12:00:00Z",
    "latency_ms": 2,
    "started_at": "2026-10-18T10:00:00Z",
    "failures_recent": 0
  },
  "scheduler": {"status": "ok", "checked_at": "2026-10-18T12:00:00Z"},
  "frontend": {"status": "ok", "checked_at": "2026-10-18T12:00:00Z"},
  "proxy": {"status": "degraded", "checked_at": "2026-10-18T12:00:00Z"}
}
```

O produtor deve validar a saúde de cada serviço e substituir o arquivo
atomicamente. Somente os quatro serviços acima, seus estados (`ok`, `degraded`,
`down`), horários e métricas numéricas permitidas são publicados. Campos extras,
mensagens livres, credenciais e caminhos do produtor não são retornados.

Arquivo ausente/inválido, coleta desatualizada ou timestamps futuros inválidos
aparecem como indisponíveis/desatualizados; não são convertidos em sucesso. O
snapshot tem limite de 64 KiB. O provisionamento do produtor e validação dos
serviços reais permanecem como tarefas de implantação, não executadas nesta etapa.
