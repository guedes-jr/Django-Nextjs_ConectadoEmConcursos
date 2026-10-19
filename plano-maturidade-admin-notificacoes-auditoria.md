# Plano — pendências de maturidade do admin

Revisado em 18/10/2026. As etapas implementadas foram retiradas deste plano.
Permanecem apenas trabalho de implementação e aceites sem evidência de conclusão.
Testes locais não substituem homologação em produção.

## Relatórios

- [ ] Validar indicadores e comparações temporais com dados representativos, incluindo cobertura dos recibos financeiros.
- [ ] Definir se atribuição UTM/referrer, acessos a artigos e suporte continuam no escopo; se aprovados, implementar as fontes de dados ausentes.
- [ ] Caso permaneçam no escopo, obter dados para reativações históricas, descontos e estornos, sem inferir valores de eventos insuficientes.

Referência: [operação dos relatórios](docs/operacao-relatorios.md).

## Métricas de notificações

- [ ] Completar as métricas de tempo de confirmação e falhas de materialização; os contadores existentes não encerram esses requisitos.

Referência: [operação de notificações](docs/operacao-notificacoes.md).

## Aceite operacional

- [ ] Homologar o modal e o isolamento de destinatários com contas controladas em produção.
- [ ] Homologar a política e a rotina de retenção da auditoria; o expurgo automático não foi habilitado na implantação registrada.
- [ ] Registrar evidências da observação por 48 horas antes de ampliar o uso.
- [ ] Homologar os fluxos autenticados das páginas consolidadas em produção; a publicação do commit `5e50bd3` está registrada em [atualização de produção](docs/atualizacao-producao-2026-10-18.md).

Referências: [implantação registrada](docs/implantacao-2026-10-18.md),
[operação de auditoria](docs/operacao-auditoria.md) e
[padrão das páginas administrativas](docs/padrao-paginas-admin.md).

## Documentação das entregas

Contratos e funcionamento das etapas concluídas permanecem em
[contratos administrativos](docs/contratos-admin-conteudos.md),
[operação dos cadastros](docs/operacao-cadastros-conteudos.md) e
[operação do diagnóstico](docs/operacao-diagnostico.md).
As dependências transversais estão na [revisão dos planos](docs/revisao-planos.md).
