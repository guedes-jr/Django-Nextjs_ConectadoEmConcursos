<p align="center">
  <img src="frontend/public/landing/logo.png" width="120" alt="Logo Conectado em Questões">
</p>

<h1 align="center">Conectado em Questões</h1>

<p align="center">
  Plataforma de estudos para concursos públicos, com questões, simulados, provas, planos de estudo e gestão de conteúdos.
</p>

<p align="center">
  <a href="https://github.com/guedes-jr/Django-Nextjs_ConectadoEmConcursos">Repositório no GitHub</a>
</p>

## Visão do produto

![Prévia da plataforma Conectado em Questões](frontend/public/landing/landingPage-system.png)

O sistema reúne uma experiência de estudo para alunos e uma área administrativa para operação de questões, provas, conteúdos, assinaturas e relatórios.

| Estudo e aprendizagem | Gestão e operação |
| --- | --- |
| Banco de questões, filtros, favoritos e revisão | Administração de usuários, planos e assinaturas |
| Simulados com correção e acompanhamento | Fontes externas, fila de revisão e publicação de questões |
| Planos de estudo, cronogramas e ciclos | Conteúdos editoriais, auditoria, notificações e diagnósticos |

## Recursos em destaque

![Prévia de simulados e edital](frontend/public/landing/simulado-edital.png)

- Questões de concursos com filtros por disciplina, banca, ano e progresso.
- Simulados, cadernos, anotações, flashcards, resumos e relatórios de desempenho.
- Planos de estudo por trilha, cronograma ou ciclo.
- Acervo de provas e gerenciamento editorial pelo painel administrativo.
- Backend Django/DRF e frontend Next.js App Router.

## Tecnologias

- **Frontend:** Next.js 16, React 19, TypeScript e Tailwind CSS.
- **Backend:** Django 5, Django REST Framework e Django Q.
- **Dados locais:** SQLite por padrão durante o desenvolvimento.
- **Produção:** serviços Django e Next.js independentes.

## Instalação local

Escolha o tutorial adequado ao seu sistema operacional. Os guias começam pela instalação das ferramentas, passam pela configuração inicial do Git e terminam com a aplicação aberta no navegador.

- [Windows — instalação local passo a passo](docs/instalacao-windows.md)
- [macOS — instalação local passo a passo](docs/instalacao-macos.md)
- [Linux (Ubuntu/Debian) — instalação local passo a passo](docs/instalacao-linux.md)

> O desenvolvimento local usa SQLite por padrão. Os tutoriais também explicam a instalação opcional do PostgreSQL para uso futuro.

## Endereços locais

Depois de iniciar os dois servidores:

- Frontend: <http://localhost:3000>
- API/Django: <http://localhost:8000>
- Django Admin: <http://localhost:8000/admin/>

## Comandos úteis

Em macOS/Linux, na raiz do repositório, o `Makefile` oferece atalhos como:

```bash
make setup
make backend
make frontend
make check
make typecheck
```

No Windows, siga os comandos diretos do [guia de Windows](docs/instalacao-windows.md), pois `make` não vem instalado por padrão.

## Estrutura principal

```text
backend/     # Django, API REST, regras de negócio e migrations
frontend/    # Next.js, páginas, componentes e interface
docs/        # Documentação operacional e tutoriais de instalação
```

Configuração de checkout e homologação financeira: [operação de pagamentos](docs/operacao-pagamentos.md).
Definições e cobertura dos indicadores: [operação de relatórios](docs/operacao-relatorios.md).
Persistência, backup e transporte transacional: [operação de infraestrutura](docs/operacao-infraestrutura.md).
Pipeline, testes de navegador e correlação de falhas: [operação de CI e E2E](docs/operacao-ci-e2e.md).
Instalação, offline e atualização: [operação de PWA](docs/operacao-pwa.md).

Assistente OpenRouter, busca de questões, biblioteca e prática: [operação de IA](docs/operacao-ia.md).

Serviços, manutenção, atualização e recuperação: [operação de deploy](docs/operacao-deploy.md).
`make deploy-plan` descreve a atualização sem executar operações.
Implantação atual e pendências: [produção em 18/10/2026](docs/implantacao-2026-10-18.md).

## Contribuição

1. Crie uma branch a partir de `main`.
2. Faça alterações pequenas e verificáveis.
3. Rode as validações adequadas antes do commit.
4. Não envie arquivos `.env`, bancos locais, chaves ou outros dados sensíveis.
