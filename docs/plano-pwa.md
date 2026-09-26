# Plano de implementação — PWA (Conectado em Concursos)

Objetivo: permitir instalação do app em dispositivos móveis (Android/iOS) e em
computadores (Chrome/Edge), com manifesto, service worker, prompt de instalação e
 fallback offline.

## Escopo do PWA

O PWA serve **apenas para navegar no sistema**, com entrada em `/login`. A landing
page (`/`) continua sendo uma página web comum, fora da experiência instalada:

- `start_url` e `id` do manifesto apontam para `/login`, nunca para a landing page;
- o prompt de instalação só aparece em `/login` e nas rotas do sistema — nunca em `/`;
- o service worker não faz precache da landing page; a home só entra em cache se o
  usuário navegar até lá;
- como a instalação parte do login, o primeiro acesso já pede autenticação, e o
  `proxy.ts` continua sendo a única fonte de verdade de rota protegida;
- atalho "Dashboard" e demais shortcuts só são úteis após o login; sem sessão, o
  `proxy.ts` redireciona para `/login` (comportamento esperado).

O `scope` permanece `/` para que as rotas internas (`/login`, `/dashboard`,
`/questions`, …) fiquem sob controle do service worker.

## Diagnóstico (base do plano)

- Next.js **16.1.1** (App Router, build com Turbopack) + React 19, sem lib de PWA.
- Backend Django em **origem separada** (`http://localhost:8000` em dev). O service
  worker do Next não intercepta a API — comportamento desejado.
- Autenticação por cookies `sessionid` / `access` / `csrftoken`, com `proxy.ts`
  protegendo as rotas privadas.
- Antes do plano: apenas `frontend/app/favicon.ico`; logo em
  `frontend/public/logos/logo.png` (292x314, RGBA, escudo navy `#101A3B` com
  detalhes claros `#D1D3D5`).
- `layout.tsx` sem `export const viewport` → sem `themeColor` nem `viewportFit: cover`.
- Deploy self-hosted: systemd (Next na 3001, Django na 8001), nginx na frente,
  branch `main`, atualização via `scripts/update.sh`.

## Decisões-chave

| Decisão | Escolha | Motivo |
|---|---|---|
| Ponto de entrada | `/login` (não a landing page) | O PWA é para usar o sistema; a landing page segue como página web comum |
| Biblioteca de SW | **SW manual** em `public/sw.js` | `serwist`/`next-pwa` usam plugin webpack; Next 16 builda com Turbopack. Hand-rolled = zero risco de build |
| Escopo do SW | apenas same-origin do Next | API fora do cache: evita CORS/credencial e vazamento de dados entre usuários no mesmo aparelho |
| Estratégia de cache | Navigations = network-first; `/_next/static` = cache-first; imagens = stale-while-revalidate | HTML nunca fica velho; assets com hash são imutáveis |
| iOS | sem `beforeinstallprompt` → banner com instruções manuais | Safari iOS não dispara o evento; exige "Compartilhar → Adicionar à Tela de Início" |
| Cores | primary `#2563eb` (claro) / `#3b82f6` (escuro), de `app/globals.css` | Mantém coerência com o tema |
| Ícones | fundo branco + escudo navy centralizado | O escudo é navy; fundo branco garante contraste em qualquer UI do sistema |

## Fase 0 — Ícones e metadados base

Geração dos ícones a partir de `frontend/public/logos/logo.png`:

| Arquivo | Tamanho | Padding do logo | Uso |
|---|---|---|---|
| `frontend/app/icon.png` | 512 | 88% | ícone padrão do Next (favicon) |
| `frontend/app/apple-icon.png` | 180 | 80% | iOS "Adicionar à Tela de Início" |
| `frontend/public/icons/icon-192.png` | 192 | 88% | manifest, `purpose: any` |
| `frontend/public/icons/icon-512.png` | 512 | 88% | manifest, `purpose: any` |
| `frontend/public/icons/maskable-512.png` | 512 | 60% | manifest, `purpose: maskable` (safe zone) |

Comando de regeneração (Pillow, sem dependência nova no projeto):

```bash
cd frontend/public/logos && python3 - <<'PY'
from PIL import Image
src = Image.open("logo.png").convert("RGB")
for out, size, pad in [
    ("../app/icon.png", 512, 0.88),
    ("../app/apple-icon.png", 180, 0.80),
    ("../icons/icon-192.png", 192, 0.88),
    ("../icons/icon-512.png", 512, 0.88),
    ("../icons/maskable-512.png", 512, 0.60),
]:
    side = int(size * pad)
    scale = min(side / src.width, side / src.height)
    mark = src.resize((max(1, int(src.width * scale)), max(1, int(src.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), "#FFFFFF")
    canvas.paste(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    canvas.save(out, "PNG", optimize=True)
    print(out, size)
PY
```

`frontend/app/layout.tsx`:

- novo `export const viewport: Viewport` com `viewportFit: "cover"`, `width`,
  `initialScale` e `themeColor` claro/escuro;
- em `metadata`: `appleWebApp: { capable: true, title: "Concursos", statusBarStyle: "default" }`
  e `formatDetection: { telephone: false }`;
- o manifest é linkado automaticamente pelo Next ao existir `app/manifest.ts`.

## Fase 1 — Manifesto

`frontend/app/manifest.ts` (MetadataRoute.Manifest):

- `name: "Conectado em Concursos"`, `short_name: "Concursos"`, `lang: "pt-BR"`, `dir: "ltr"`;
- `id: "/login"`, `start_url: "/login?source=pwa"`, `scope: "/"`,
  `display: "standalone"`, `orientation: "any"` (desktop);
- `theme_color` / `background_color` coerentes com `ThemeProvider`;
- `categories: ["education", "productivity"]`;
- `icons`: 192 e 512 com `purpose: "any"`, mais 512 com `purpose: "maskable"`;
- `shortcuts`: Dashboard, Simulados, Questões, Plano de Estudos (após o login; sem
  sessão, o `proxy.ts` redireciona para `/login`).

## Fase 2 — Service worker

`frontend/public/sw.js` (JS puro, sem build):

- `const VERSION = "cq-v1"`, com caches `cq-precache-${VERSION}` e
  `cq-runtime-${VERSION}`;
- `install`: precacheia `/login` e `/offline` **junto com os assets referenciados no
  HTML** (extrai `/_next/static/**.js|css|woff2` por regex), mais `/favicon.ico`,
  `/manifest.webmanifest`, os ícones e `/logos/logo.png`; a landing page (`/`) não é
  precacheada. Sem `skipWaiting()` — a nova versão fica esperando e só entra após o
  clique em "Atualizar" (evita trocar o app no meio de um preenchimento);
- `activate`: apaga caches `cq-*` de versões antigas e faz `clients.claim()`;
- `fetch`:
  - ignora tudo que não for `GET`, o que for cross-origin (Django) e `/api/`;
  - `navigate` → network-first; em falha, usa o cache; sem match, **redireciona (302)
    para `/offline`** em vez de servir o HTML do offline na URL original (evita erro de
    hidratação do App Router); último recurso é um HTML inline sem JS;
  - `/_next/static/`, `/icons/`, favicon e manifest → cache-first (imutáveis por hash);
  - demais imagens → stale-while-revalidate;
  - nunca cacheia resposta redirecionada (`response.redirected`), então rotas
    protegidas (que redirecionam para `/login`) não viram entrada de cache;
- `message` → `SKIP_WAITING` (disparado pelo botão "Atualizar").

`frontend/app/(public)/offline/page.tsx`: página pública de fallback (fora do `matcher`
do `proxy.ts`), com botão "Tentar novamente" e atalho para `/login` quando a conexão
volta.

## Fase 3 — Registro e prompt de instalação

- `frontend/components/pwa/ServiceWorkerRegister.tsx` (`'use client'`): registra
  apenas com `NODE_ENV === "production"`; implementa o fluxo de atualização
  (`onupdatefound` → banner "Nova versão disponível" → `postMessage(SKIP_WAITING)` →
  `controllerchange` → `location.reload()`) e um `registration.update()` por hora;
- `frontend/components/pwa/InstallPrompt.tsx` (`'use client'`):
  - não renderiza na landing page (`pathname === "/"`);
  - captura `beforeinstallprompt` (Chromium/Edge/Android/desktop), mostra banner com
    "Instalar" e "Agora não" (despensa por 7 dias em `localStorage`);
  - detecta iOS não instalado → instruções "Compartilhar → Adicionar à Tela de Início";
  - esconde se `matchMedia("(display-mode: standalone)").matches` ou `navigator.standalone`;
- Montados dentro de `ThemeProvider` no `layout.tsx` raiz, abaixo de `{children}`.

## Fase 4 — UX mobile

- `app/globals.css`: classes `.safe-top` / `.safe-bottom` com `env(safe-area-inset-*)`,
  `-webkit-tap-highlight-color: transparent` e `overscroll-behavior-y: none`;
- `.safe-top` no `AppHeader` (evita a barra de status cobre o logo no modo standalone);
- logos com `unoptimized` (`/logos/logo.png` e `/icons/icon-192.png`) para não depender
  do otimizador `/_next/image` quando offline;
- Ajustar a `lousa` (Excalidraw) e o chat para não quebrarem com `viewport-fit: cover`
  (padding nas barras) — verificar em device real.
- Opcional: badge de "offline" com `navigator.onLine` + eventos `online`/`offline`
  (a página `/offline` já faz isso localmente).

## Fase 5 — Headers, deploy e validação

`frontend/next.config.ts` → `async headers()`:

- `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate` e `Service-Worker-Allowed: /`;
- `/manifest.webmanifest`: `Content-Type: application/manifest+json`, `no-cache`.

Deploy:

- nginx (fora do repo): `location = /sw.js { add_header Cache-Control "no-cache"; }`;
- bump da const `VERSION` de `sw.js` a cada release (ou derivar do `BUILD_ID` do Next);
- `proxy.ts`: garantir que `/sw.js`, `/manifest.webmanifest` e `/offline` permaneçam
  fora do `matcher`.

Validação:

- Lighthouse → categoria PWA (installability e service worker);
- DevTools → Application → Manifest / Service Workers; testar com "Offline" em
  `/dashboard` e `/questions`;
- device real: iOS Safari, Android Chrome, desktop Chrome/Edge.

> Feito em 2026-09-26: validação automatizada com Chrome headless via DevTools
> Protocol (registro do SW, conteúdo dos caches, navegação offline, banner de
> instalação). Falta apenas a conferência em device real (iOS e Android) e o ajuste
> de safe-area na `lousa`/chat.

## Riscos

1. **Cache de dado autenticado** → as páginas são shell estático (os dados vêm da API
   Django, cross-origin, nunca cacheada); respostas redirecionadas não são cacheadas.
2. **HTML velho** → resolvido por network-first em navigations.
3. **SW em dev** conflita com HMR → registrar apenas em produção.
4. **Turbopack** → nada de plugin webpack; o SW é arquivo estático.
5. **iOS** → sem prompt nativo e sem push sem "add to home screen".
6. **ChunkLoadError offline** → páginas precacheadas também guardam seus chunks; o
   fallback final do SW é um HTML inline, sem dependência de JS.

Estimativa: ~1 a 1,5 dia (Fases 0–3 ≈ 80% do esforço).

## Progresso

- [x] Fase 0 — ícones gerados + `viewport`/`appleWebApp` no `layout.tsx`
- [x] Fase 1 — `app/manifest.ts`
- [x] Fase 2 — `public/sw.js` + `app/(public)/offline/page.tsx`
- [x] Fase 3 — `ServiceWorkerRegister` + `InstallPrompt` montados no layout raiz
- [x] Fase 4 — `.safe-top`/`.safe-bottom`, tap-highlight, `overscroll-behavior`,
      logos com `unoptimized`; falta revisar `lousa`/chat em device real
- [x] Fase 5 — `headers()` em `next.config.ts` e validação automatizada
- [ ] Pendente de deploy — regra de cache do `/sw.js` no nginx do servidor
- [ ] Pendente de device real — iOS Safari e Android Chrome

## Arquivos

| Arquivo | Papel |
|---|---|
| `frontend/app/manifest.ts` | manifesto (entry `/login`, standalone, maskable, shortcuts) |
| `frontend/app/icon.png`, `frontend/app/apple-icon.png` | ícone padrão e iOS |
| `frontend/public/icons/*` | ícones do manifesto (192, 512, maskable) |
| `frontend/public/sw.js` | service worker (precache, offline, atualização) |
| `frontend/app/(public)/offline/page.tsx` | página de fallback offline |
| `frontend/components/pwa/ServiceWorkerRegister.tsx` | registro do SW + aviso de nova versão |
| `frontend/components/pwa/InstallPrompt.tsx` | banner de instalação (Chromium) e instruções (iOS) |
| `frontend/app/layout.tsx` | `viewport`, `appleWebApp`, montagem dos componentes PWA |
| `frontend/next.config.ts` | headers de `/sw.js` e `/manifest.webmanifest` |
| `frontend/app/globals.css` | `.safe-top` / `.safe-bottom` e ajustes mobile |

