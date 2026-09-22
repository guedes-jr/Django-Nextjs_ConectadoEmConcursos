# Changelog

Seguindo "Keep a Changelog" e SemVer. Mantido por desenvolvedores do projeto.

## [Unreleased]
### Added
- Recuperação e alteração de senha com tokens de uso único e validação Django.
- Importador JSON/CSV idempotente para provas e questões, com modo `--dry-run`.
- Chat com contexto real, limites por plano e auditoria de tokens.
- Capacidades dos planos aplicadas às APIs de questões e chat.
- Estrutura inicial do monorepo: backend (Django + DRF + allauth + dj-rest-auth) e frontend (Next.js App Router).
- Documentação: README, docs/Google_Oauth.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md.
- Configuração OAuth Google (documentada) e utilitários para criação do SocialApp.
- Cliente HTTP axios no frontend com withCredentials e hook useAuth.
- .gitignore e .env.example.
- Private license (LICENSE).

### Changed
- Ajustes iniciais de CORS/CSRF nas settings para suportar desenvolvimento local.

### Fixed
- N/A

### Security
- Diretório backend/keys e variáveis sensíveis excluídos do versionamento (.gitignore).

---

## [0.1.0] - 2026-01-09
### Added
- Versão inicial pública do repositório com:
  - Backend: configurações base, migrações iniciais e instruções para criação de superuser.
  - Frontend: layout, página de login, página de dashboard e exemplos de integração OAuth.
  - Diagrama arquitetural em README (Mermaid).
  - Arquivos de suporte: LICENSE (privada), CODE_OF_CONDUCT.md, CHANGELOG.md (este arquivo).

---

Como usar este changelog
- Para cada alteração relevante, adicione uma entrada em "Unreleased" categorizada como Added/Changed/Fixed/Deprecated/Removed/Security.
- Ao fazer um release, renomeie a seção "[Unreleased]" para "[X.Y.Z] - YYYY-MM-DD" e adicione notas de migração se necessário.
- Siga SemVer: MAJOR.MINOR.PATCH.

Exemplo de release:
- Atualize CHANGELOG.md
- Tag: git tag -a vX.Y.Z -m "Release X.Y.Z"
- Push: git push origin main --tags

```// filepath: /home/junior/Projects/Django-Nexjs_ConectadoEmQuestoes/CHANGELOG.md
# Changelog

Seguindo "Keep a Changelog" e SemVer. Mantido por desenvolvedores do projeto.

## [Unreleased]
### Added
- Estrutura inicial do monorepo: backend (Django + DRF + allauth + dj-rest-auth) e frontend (Next.js App Router).
- Documentação: README, docs/Google_Oauth.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md.
- Configuração OAuth Google (documentada) e utilitários para criação do SocialApp.
- Cliente HTTP axios no frontend com withCredentials e hook useAuth.
- .gitignore e .env.example.
- Private license (LICENSE).

### Changed
- Ajustes iniciais de CORS/CSRF nas settings para suportar desenvolvimento local.

### Fixed
- N/A

### Security
- Diretório backend/keys e variáveis sensíveis excluídos do versionamento (.gitignore).

---

## [0.1.0] - 2026-01-09
### Added
- Versão inicial pública do repositório com:
  - Backend: configurações base, migrações iniciais e instruções para criação de superuser.
  - Frontend: layout, página de login, página de dashboard e exemplos de integração OAuth.
  - Diagrama arquitetural em README (Mermaid).
  - Arquivos de suporte: LICENSE (privada), CODE_OF_CONDUCT.md, CHANGELOG.md (este arquivo).

---

Como usar este changelog
- Para cada alteração relevante, adicione uma entrada em "Unreleased" categorizada como Added/Changed/Fixed/Deprecated/Removed/Security.
- Ao fazer um release, renomeie a seção "[Unreleased]" para "[X.Y.Z] - YYYY-MM-DD" e adicione notas de migração se necessário.
- Siga SemVer: MAJOR.MINOR.PATCH.

Exemplo de release:
- Atualize CHANGELOG.md
- Tag: git tag -a vX.Y.Z -m "Release X.Y.Z"
- Push: git push origin main --tags
