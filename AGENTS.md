# Conectado em Questões

Full-stack app: Django/DRF in `backend/` and Next.js App Router in `frontend/`.

## Work efficiently

- Read only the files relevant to the request. Use `rg` for discovery; do not load the
  whole repository, generated directories, lockfiles, or binary assets unless needed.
- Reuse the root `Makefile` commands. Prefer the narrowest relevant check before the
  full suite: `make check`, `make test-app APP=apps.<app>`, `make lint`, or
  `make typecheck`.
- Do not install dependencies, run builds, or run the full test suite unless the task
  requires it or a focused check indicates it is necessary.
- Keep changes scoped. Preserve existing user changes and do not reformat unrelated
  files.

## Where to look

- Django configuration and routes: `backend/config/`; domain apps: `backend/apps/`.
- Next.js routes: `frontend/app/`; components: `frontend/components/`; API clients:
  `frontend/lib/`.
- Use `docs/Google_Oauth.md` only for OAuth work and `docs/plano-pwa.md` only for PWA
  work.

## Database and question bank

- `plano-banco-questoes.md` is the active implementation plan. Preserve it; never
  delete, move, or replace it unless the user explicitly requests that change.
- For changes under `backend/apps/questions/`, consult the relevant portion of that
  plan before changing models, migrations, ingestion, moderation, or visibility.
- Treat Django migrations as part of a schema change and run `make migration-check`
  when practical.

## Safety

- Never commit secrets, `.env` files, local keys, databases, or generated artifacts.
- Do not run data-import or synchronization commands without an explicit request.
