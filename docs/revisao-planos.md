# Revisão dos planos — 18/10/2026

Limpeza dos planos após as etapas de implementação e consolidação do admin.
Os planos ativos agora contêm apenas pendências; descrições de funcionamento,
contratos e operação permanecem nos documentos de referência.
Nenhum aceite externo foi considerado concluído a partir de testes locais.

## Inventário

| Documento | Situação |
| --- | --- |
| [Maturidade do admin](../plano-maturidade-admin-notificacoes-auditoria.md) | Etapas entregues retiradas; restam métricas, dependências condicionais e homologação operacional. |
| [PWA](plano-pwa.md) | Fases implementadas retiradas; resta homologação em dispositivos e navegadores reais. |
| [Requisitos](requisitos.md) | Mantido como inventário transversal; implementação e aceite externo devem ser distinguidos pelas referências abaixo. |
| `fase-0-cadastros-conteudos.md` e `fase-0-maturidade-admin.md` | Já removidos na revisão anterior; contratos preservados em [contratos administrativos](contratos-admin-conteudos.md). |
| `plano-banco-questoes.md` | Não localizado. Não foi removido, movido nem recriado. |

Os dois planos restantes não estão integralmente concluídos e foram preservados
com seus nomes atuais para manter as referências existentes.
README, instruções, contratos, padrões de interface e manuais operacionais não
foram tratados como planos descartáveis.

## Pendências transversais

- [ ] Configurar a conta e os preços Stripe e homologar checkout, webhooks, renovação e cancelamento no ambiente real. A implementação existe; o registro de implantação não comprova a configuração do provedor. Ver [pagamentos](operacao-pagamentos.md).
- [ ] Provisionar remetente e credenciais de e-mail e comprovar recebimento transacional real; a implantação registrada ainda usa console. Ver [infraestrutura](operacao-infraestrutura.md).
- [ ] Se PostgreSQL continuar como destino, planejar a migração dos dados e homologar backup/restauração com roundtrip real. A produção registrada usa SQLite persistente.
- [ ] Homologar cópia externa dos backups, recuperação/PITR quando aplicável e snapshot do acervo privado. Backups locais não cobrem perda do servidor. Ver [infraestrutura](operacao-infraestrutura.md) e [deploy](operacao-deploy.md).
- [ ] Conferir a primeira execução remota da CI e configurar checks obrigatórios na proteção da branch; não houve push nesta sequência de trabalho.
- [ ] Provisionar coletor e alertas de erros em produção e ampliar a matriz de navegadores conforme homologação. Ver [CI e E2E](operacao-ci-e2e.md).

As pendências específicas de relatórios, notificações, retenção, observação por
48 horas e publicação das telas locais estão no [plano do admin](../plano-maturidade-admin-notificacoes-auditoria.md).
A homologação de instalação e experiência móvel está no [plano PWA](plano-pwa.md).

## Referências das entregas concluídas

- [Implantação de 18/10/2026](implantacao-2026-10-18.md): evidências e limites da validação em produção.
- [Padrão das páginas administrativas](padrao-paginas-admin.md): consolidações locais, incluindo Fontes de questões e Acervo de provas.
- [Notificações](operacao-notificacoes.md), [auditoria](operacao-auditoria.md), [diagnóstico](operacao-diagnostico.md) e [relatórios](operacao-relatorios.md): contratos e procedimentos.
- [IA e OpenRouter](operacao-ia.md): recuperação de questões aprovadas, modelos gratuitos por padrão e biblioteca privada.
- [Operação do PWA](operacao-pwa.md): comportamento implementado e testes reproduzíveis. Para a situação do nginx real, prevalece o registro posterior de implantação.

Esta limpeza altera apenas documentação. Não publica código, altera serviços ou
executa importações, sincronizações, retenção ou testes em dados de produção.
