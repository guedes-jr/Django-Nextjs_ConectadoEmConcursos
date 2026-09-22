.DEFAULT_GOAL := help
SHELL := /bin/bash

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend
VENV_DIR := $(BACKEND_DIR)/.venv
PYTHON := $(VENV_DIR)/bin/python
PIP := $(VENV_DIR)/bin/pip
MANAGE := cd $(BACKEND_DIR) && $(PYTHON) manage.py
NPM := cd $(FRONTEND_DIR) && npm
FILE ?=
DRY_RUN ?= 0
DRY_RUN_FLAG := $(if $(filter 1 true yes,$(DRY_RUN)),--dry-run,)
MSG ?= $(msg)

.PHONY: help setup venv install install-backend install-frontend dev backend frontend \
	migrate migrations migration-check superuser shell dbshell test test-app check \
	lint typecheck build quality import-content collectstatic \
	git-status git-diff commit-feat commit-fix commit-docs commit-test commit-chore

help: ## Exibe os comandos disponíveis
	@printf "\nConectado em Questões — comandos de desenvolvimento\n\n"
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  make %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nExemplos:\n"
	@printf "  make test-app APP=apps.chat\n"
	@printf "  make import-content FILE=./dados/questoes.json DRY_RUN=1\n\n"

setup: install migrate ## Prepara dependências e banco para o primeiro uso

venv: ## Cria o ambiente virtual Python, se necessário
	@test -x $(PYTHON) || python3 -m venv $(VENV_DIR)

install: install-backend install-frontend ## Instala todas as dependências

install-backend: venv ## Instala as dependências do Django
	@$(PIP) install --upgrade pip
	@$(PIP) install -r $(BACKEND_DIR)/requirements.txt

install-frontend: ## Instala as dependências do Next.js de forma reproduzível
	@cd $(FRONTEND_DIR) && npm ci

dev: ## Inicia frontend e backend juntos
	@$(NPM) run dev

backend: ## Inicia somente o Django em localhost:8000
	@$(MANAGE) runserver

frontend: ## Inicia somente o Next.js em localhost:3000
	@$(NPM) run dev:frontend

migrate: ## Aplica as migrações do banco
	@$(MANAGE) migrate

migrations: ## Cria migrações a partir dos models
	@$(MANAGE) makemigrations

migration-check: ## Verifica se existem alterações sem migração
	@$(MANAGE) makemigrations --check --dry-run

superuser: ## Cria um superusuário Django
	@$(MANAGE) createsuperuser

shell: ## Abre o shell do Django
	@$(MANAGE) shell

dbshell: ## Abre o shell do banco configurado
	@$(MANAGE) dbshell

test: ## Executa toda a suíte de testes backend
	@$(MANAGE) test

test-app: ## Testa um módulo específico (ex.: APP=apps.chat)
	@test -n "$(APP)" || (printf "Erro: informe APP. Ex.: make test-app APP=apps.chat\n"; exit 2)
	@$(MANAGE) test $(APP)

check: ## Executa verificações do Django e das migrações
	@$(MANAGE) check
	@$(MAKE) --no-print-directory migration-check

lint: ## Executa o ESLint do frontend
	@$(NPM) run lint

typecheck: ## Verifica os tipos TypeScript sem gerar arquivos
	@cd $(FRONTEND_DIR) && npx tsc --noEmit

build: ## Gera o build de produção do Next.js
	@$(NPM) run build

quality: check test lint typecheck ## Executa todas as verificações locais, exceto o build

import-content: ## Importa questões/provas; use FILE=arquivo.json [DRY_RUN=1]
	@test -n "$(FILE)" || (printf "Erro: informe FILE. Ex.: make import-content FILE=./dados/questoes.json DRY_RUN=1\n"; exit 2)
	@$(MANAGE) import_content "$(abspath $(FILE))" $(DRY_RUN_FLAG)

collectstatic: ## Coleta arquivos estáticos do Django para produção
	@$(MANAGE) collectstatic --no-input

git-status: ## Exibe o estado atual do repositório
	@git status

git-diff: ## Exibe as alterações ainda não adicionadas ao stage
	@git diff

_check-msg:
	@test -n "$(MSG)" || (printf 'Erro: informe a mensagem. Ex.: make commit-feat msg="ajustes no projeto"\n'; exit 2)

commit-feat: _check-msg ## Adiciona tudo e cria um commit do tipo feat
	@git add .
	@git commit -m "feat: $(MSG)"

commit-fix: _check-msg ## Adiciona tudo e cria um commit do tipo fix
	@git add .
	@git commit -m "fix: $(MSG)"

commit-docs: _check-msg ## Adiciona tudo e cria um commit do tipo docs
	@git add .
	@git commit -m "docs: $(MSG)"

commit-test: _check-msg ## Adiciona tudo e cria um commit do tipo test
	@git add .
	@git commit -m "test: $(MSG)"

commit-chore: _check-msg ## Adiciona tudo e cria um commit do tipo chore
	@git add .
	@git commit -m "chore: $(MSG)"
