# Operação do diagnóstico

A área `/admin/diagnostico` somente responde quando `DIAGNOSTICS_ENABLED=1` e o usuário é superusuário. Ela não é um substituto para monitoramento externo.

## Logs permitidos

Defina arquivos específicos em `DIAGNOSTICS_LOG_FILES`, separados por vírgula. Exemplo:

```env
DIAGNOSTICS_LOG_FILES=/srv/conectado/logs/django.log,/srv/conectado/logs/worker.log
```

O navegador escolhe apenas o nome de um arquivo previamente configurado; nunca envia caminhos. A leitura é limitada, somente leitura, e padrões comuns de segredos são redigidos.

## Scripts

A aba Scripts executa apenas rotinas internas registradas no backend, sem parâmetros e somente leitura. Não há terminal, `exec`, subprocessos, rede ou acesso a variáveis de ambiente. Cada leitura de log e execução é auditada.
