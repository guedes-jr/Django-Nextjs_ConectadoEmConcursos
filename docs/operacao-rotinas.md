# Gestão de rotinas operacionais

A página **Operação → Rotinas e monitoramento**, em `/admin/rotinas`, também está disponível pelo
atalho `/plataform/rotinas`. Ela exige superadministrador ativo e staff. O acesso
à configuração e aos metadados do histórico não depende do diagnóstico técnico;
a consulta do conteúdo dos logs exige também `DIAGNOSTICS_ENABLED=1` e concessão
**explícita** de `backoffice.access_diagnostics`, como na área de diagnóstico
existente. Leituras de logs e mudanças de agenda geram auditoria sem copiar logs.

A navegação lateral tem uma única entrada para essa área. A primeira aba,
**Rotinas**, concentra adicionar, editar e remover; a segunda, **Diagnósticos e
logs**, reúne histórico, logs e acesso às ferramentas de diagnóstico técnico da
plataforma. A antiga URL `/admin/diagnostico` continua funcionando para links
existentes, sem entrada separada no menu.

## Agendamentos

O catálogo inicial corresponde às operações já provisionadas no systemd:

- Publicar avisos administrativos agendados.
- Publicar artigos/notícias editoriais agendados.
- Criar backup local do banco e mídia.

O painel adiciona horários para essas rotinas conhecidas. Não aceita comandos,
SQL, scripts ou caminhos de arquivos. Outras rotinas precisam entrar no catálogo
versionado antes de aparecerem na página. Importação/sincronização externa,
restauração e expurgo de auditoria não são habilitados por esta funcionalidade.
Tarefas avulsas do worker Django Q e crons externos não são administrados aqui.

É possível criar vários agendamentos para uma mesma rotina, editar seus nomes,
pausar/reativar, selecionar intervalo (1 a 43200 minutos) ou horário diário e
escolher America/Fortaleza, America/Sao_Paulo ou UTC. Horários diários são
interpretados no fuso selecionado. Os intervalos são contados a partir da última
verificação que iniciou a execução, sem depender do fuso do host.

Ao criar ou mudar o horário/reativar, a próxima ocorrência é recalculada. Mudar
somente o nome preserva a próxima ocorrência. Salvar não dispara uma execução.
Pausar impede novas ocorrências; uma execução já iniciada continua. Não há
exclusão física de agendamentos: a ação **Remover** retira o agendamento da lista
e bloqueia novas ocorrências, preservando o histórico e sua auditoria. A remoção
exige confirmação na página. A migração `backoffice.0015` adiciona esse estado.

As migrações `backoffice.0013` e `0014` criam o histórico e a agenda padrão:
publicações a cada minuto; backup diário às 03:15 de America/Fortaleza. Essa
agenda não executa nada sem o dispatcher provisionado. O sinal recente do
executor aparece quando ele verificou a rotina nos últimos três minutos.

## Provisionar o executor

O código não modifica os serviços do servidor ao salvar um horário no navegador.
Os templates atualizados ficam em `deploy/systemd/`:

- `conectado-concursos-publish.service` chama
  `manage.py run_scheduled_routines --routine publish_notifications --routine publish_news`.
- `conectado-concursos-backup.service` chama
  `manage.py run_scheduled_routines --routine backup`.
- Ambos os timers verificam a agenda a cada minuto. O horário do backup passou
  para o banco, deixando de ser um `OnCalendar=03:15` com atraso aleatório.

Durante uma implantação com janela de manutenção:

1. Parar os dois timers e aguardar/parar seus jobs antes de atualizar o código.
2. Aplicar `make migrate`.
3. Instalar os quatro templates atualizados, preservando os caminhos, usuário e
   ambiente reais da instalação. Os templates usam o caminho legado
   `/var/www/conectado-em-concursos/backend`; instalações por release devem
   apontar para seu checkout/release ativo. Remover crons que executem as mesmas
   publicações/backups diretamente.
4. Executar `sudo systemctl daemon-reload` e reiniciar os dois timers.
5. Conferir seus estados com `systemctl status` e o próximo disparo com
   `systemctl list-timers`. Verificar o sinal recente no painel e, após o horário
   programado, o histórico da rotina.

O atualizador continua usando os mesmos nomes de unidades; instalar estes
novos templates é uma etapa de provisionamento, não é feito automaticamente
pelo `scripts/update.sh`. Enquanto os serviços antigos permanecerem instalados,
as alterações feitas na agenda do painel não controlam aqueles comandos diretos.
Não rodar serviços antigos e o dispatcher em paralelo.

O dispatcher é um processo síncrono executado pelo systemd em **um único host**.
Publicações têm timeout global do serviço de 660 s; backup, 900 s. O systemd
encerra o grupo de processos em caso de timeout. Esses limites dependem das
unidades provisionadas; executar o comando manualmente não impõe um timeout
Python. O backup também mantém seu bloqueio próprio contra backup/restauração.

## Concorrência, falhas e diagnóstico

Cada ocorrência é registrada antes da execução. Há bloqueio de arquivo por
rotina (em `BACKUP_DIR/.routines/`) e coordenação transacional no banco para não
iniciar execuções simultâneas da mesma rotina, inclusive entre agendamentos.
As garantias operacionais presumem o único host de agendamento; não distribuir
os timers por vários hosts sem coordenação adicional.

Depois de uma indisponibilidade, o dispatcher roda uma ocorrência vencida e
calcula a próxima a partir do momento atual. Não reproduz um backlog de milhares
de ocorrências nem repete automaticamente os efeitos de uma execução com erro.
Um erro não impede verificar outras rotinas; o comando termina com código de
erro se algum job falhou, para aparecer também no systemd/journal.

Estados: **Em execução**, **Sucesso**, **Erro** e **Interrompida**. O diagnóstico
filtra por rotina/status e pagina o histórico. Os totais mostram todo o histórico
gerenciado. O início/fim da lista usam America/Fortaleza; a próxima ocorrência
usa o fuso de seu agendamento.

São armazenadas a saída padrão, saída de erro e mensagens de logging da thread
do executor que chegam ao handler, com traceback em exceções. A redação usa os
mesmos filtros do diagnóstico existente. A saída é limitada a 64 KiB por
execução; linhas excessivas também são limitadas/omitidas. O log é persistido ao
final, não é streaming. Não registrar credenciais nas rotinas continua sendo
obrigatório: redação não é garantia contra formatos arbitrários de segredos.

Se o processo for encerrado sem concluir, o registro fica Em execução até a
próxima verificação após o timeout da rotina mais 60 s (publicações: 360 s;
backup: 960 s). Sem bloqueio ativo, o dispatcher o marca como Interrompida,
inclusive se o agendamento foi pausado ou a próxima ocorrência é no dia seguinte.
Nesse caso o log informa a interrupção; detalhes do encerramento devem ser
consultados no journal da unidade. Se o dispatcher estiver parado, a detecção
aguarda seu retorno; o painel sinaliza falta de verificação recente.

O histórico começa com este executor. Não converte retroativamente os logs do
systemd nem a auditoria histórica em execuções detalhadas. Os dados são
preservados sem expurgo automático; acompanhar o crescimento das tabelas e
incluir sua política de retenção no planejamento operacional.

## Validação

Os testes usam banco temporário, rotinas simuladas e uma publicação editorial
sintética isolada. Não executam backup, importação ou sincronização de dados
operacionais. A implantação dos serviços e a execução real de produção não
fazem parte da implementação local.
