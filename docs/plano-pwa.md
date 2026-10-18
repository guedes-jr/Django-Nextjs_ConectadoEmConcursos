# Plano — homologação pendente do PWA

Revisado em 18/10/2026. A implementação de manifesto, ícones, service worker,
instalação, atualização, fallback offline e ajustes móveis foi concluída.
As fases entregues foram retiradas do plano; a documentação técnica permanece em
[operação do PWA](operacao-pwa.md).

As regras de cache e o ID do build foram verificados no nginx de produção em
18/10/2026, conforme o [registro da implantação](implantacao-2026-10-18.md).
Não há evidência de homologação nos dispositivos abaixo.

## iOS Safari real

- [ ] Instalar por Compartilhar → Adicionar à Tela de Início e abrir em modo standalone.
- [ ] Conferir recortes, safe-area, teclado, rotação e retorno do segundo plano no chat e na lousa.
- [ ] Verificar atualização de versão e recuperação após perda de conexão.

## Android Chrome real

- [ ] Validar instalação nativa e abertura do aplicativo instalado.
- [ ] Conferir teclado, redução da área visível, rotação e controles do chat e da lousa.
- [ ] Testar atualização com múltiplas abas e navegação após perda e retorno da conexão.

## Chrome e Edge desktop

- [ ] Homologar instalação, desinstalação, atualização e retomada pelo navegador.

## Critério de encerramento

Registrar navegador, versão do sistema, aparelho, release validada e resultado de
cada cenário. Preservar o escopo atual: o fallback apenas informa a indisponibilidade;
não há autenticação, estudo ou gravação de dados privados offline.
Testes automatizados e emulação móvel não substituem esses aceites.
