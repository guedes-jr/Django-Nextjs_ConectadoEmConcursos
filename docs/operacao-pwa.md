# PWA — operação e homologação da etapa 9

## Comportamento implementado

- Manifesto inicia em `/login?source=pwa`, com escopo `/`, ícones comuns/maskable e
  atalhos protegidos pela autenticação existente. Landing não exibe instalação.
- `/sw.js` é uma rota estática de build que usa `lib/pwa/service-worker.js`. O ID
  do worker corresponde ao BUILD_ID do Next e é compartilhado entre seus workers.
  Cada build cria uma identidade; servir o mesmo artefato em todas as instâncias.
  Não configurar CONECTADO_BUILD_ID manualmente para reutilizar IDs entre builds.
- O precache contém somente `/offline`, seus chunks e os assets públicos permitidos.
  Navegação online nunca persiste HTML de login, landing ou páginas privadas.
  APIs, RSC, uploads, otimizador e imagens de usuário ficam fora do CacheStorage,
  inclusive se a API estiver na mesma origem. O limite de runtime é de 100 entradas.
- Instalação incompleta é rejeitada; a versão anterior permanece disponível.
  Falha de quota em runtime não impede a resposta online. Uma nova ativação remove
  caches `cq-*` antigos, incluindo os caches mais amplos da implementação anterior.
- Sem conexão, navegações vão para `/offline`, com a URL própria do fallback para
  evitar hidratar uma página com HTML de outra. Ao voltar online, “Tentar novamente”
  leva ao login. Não há login, questões, chat, desenhos ou operações sincronizadas offline.
- Nova instalação espera confirmação. O registro não usa cache HTTP na busca de
  atualizações, trata atualização já iniciada e limpa timers/listeners ao desmontar.
  A primeira ativação não recarrega a página. Atualizações seguintes recarregam as
  abas controladas após o botão Atualizar; o aviso orienta salvar o trabalho antes.
- Prompt Chromium trata erro de instalação; iOS recebe instruções manuais e modo
  standalone esconde o banner. Dispensa é persistida por sete dias. Eventos nativos
  e aceitação final dependem do navegador/sistema operacional.

## Layout móvel

Chat tem input que pode encolher, área de mensagens com altura dinâmica e padding
nas safe-areas. Lousa usa `dvh` e margens para recortes laterais/rodapé. Viewport usa
`interactive-widget=resizes-content` nos navegadores que reconhecem essa indicação.

A revisão visual detectou o botão de tema cobrindo Enviar e controles da lousa.
Nessas duas telas, o tema passou ao menu da conta e os botões flutuantes de tema e
voltar ao topo ficam ausentes. O tema continua acessível no menu; as outras telas
mantêm seu comportamento anterior.

## Proxy e publicação

Adaptar `deploy/nginx/pwa.conf.example` no server HTTPS real. A porta 3001 do exemplo
é ilustrativa. Verificar o arquivo com nginx -t e revisar headers de segurança
herdados, porque diretivas add_header na location mudam sua herança.

A rota `/sw.js` deve chegar ao Next, não a um antigo arquivo público ou cache de CDN.
O script precisa responder JavaScript, Service-Worker-Allowed `/` e Cache-Control
`no-cache, no-store, must-revalidate`; o manifesto deve ser revalidado. Conferir isso
na borda pública, não somente no Next local. Não cachear HTML autenticado nem APIs
no proxy. Não foi aplicada configuração em servidor ou CDN nesta etapa.

Publicar releases de modo coordenado e preservar chunks do release anterior durante
transição de abas abertas. Em caso de falha de instalação, verificar os downloads
obrigatórios e tentar novamente online. Instalar o PWA exige HTTPS, com a exceção de
loopback para desenvolvimento. Não invalidar dados locais do usuário como rotina
normal de atualização.

Referências: [ciclo de vida de service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers),
[registro e updateViaCache](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register),
[ID de build do Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/generateBuildId).

## Testes reproduzíveis

A configuração de Playwright acrescenta `pwa-desktop` e `pwa-mobile` quando
E2E_PRODUCTION=1. Esses projetos permitem service workers reais; os seis cenários
funcionais anteriores continuam bloqueando workers para isolar seus fluxos.
A CI já usa esse modo, portanto incorpora os novos cenários automaticamente.

```sh
E2E_RUN=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8100 NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8100 make build
E2E_PRODUCTION=1 make test-e2e
```

Oito cenários PWA por perfil, além dos seis funcionais: manifesto/ícones/headers/ID,
fallback offline e recuperação, ausência de conteúdo privado no cache, preservação
de formulário e dispensa, falha do prompt, instalação de novo worker esperando
confirmação/limpeza, chat/lousa em viewport estreito e instruções iOS/standalone.
A atualização nativa é exercitada registrando o mesmo script compilado com outra
URL de teste; não se altera o endpoint de produção. A identidade de release é
conferida contra o BUILD_ID. O registro por URL de teste é restrito ao contexto
isolado do browser e descartado ao terminar.

A emulação móvel usa Chromium com perfil Pixel e redução de viewport, não um
teclado físico. As instruções iOS são testadas por simulação das características
expostas pelo navegador, sem executar WebKit/Safari. Não comprovam a instalação
nativa. As capturas do compositor e da lousa foram inspecionadas localmente.

## Aceite externo pendente

- Conferir nginx/CDN/HTTPS reais e primeira execução remota da CI após o push.
- iOS Safari: instalar pela folha Compartilhar, abrir standalone, testar notch,
  rotação, teclado, retorno do background, atualização e recuperação offline.
- Android Chrome: instalação nativa, teclado/redução real da área visível,
  rotação, controles da lousa e troca de versão com múltiplas abas.
- Chrome/Edge desktop: instalação/desinstalação pelo menu, atualização e retomada.

Esses itens permanecem abertos no plano; não há aparelho real conectado ou servidor
provisionado nesta etapa. Não foram alterados ícones, banco, dependências ou serviços externos.
