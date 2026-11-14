# Tunebox – demo music streaming app (Docker-first)

A small Spotify/Gaana-style app: **frontend (nginx) → backend (Node/Express) → PostgreSQL**.
All artists and tracks are fictional seed data; audio is synthesised in the browser (Web Audio), so no media files or external calls are needed.

## Run locally
```bash
cp .env.example .env        # optional; dev defaults exist
docker compose up --build
```
Open http://localhost:3000 – browse, filter by genre, search, create an account, like songs, play.
Reset DB (re-runs seed): `docker compose down -v`

## Layout
| Path | What |
|---|---|
| `frontend/` | Static SPA on unprivileged nginx; proxies `/api`; CSP + security headers |
| `backend/` | Express API: `/health`, `/api/tracks`, `/api/genres`, `/api/tracks/:id/play`, `/api/auth/*`, `/api/favorites` |
| `db/init.sql` | Schema + seed, auto-run on first DB start |
| `docker-compose.yml` | 3 services, healthchecks, private networks, read-only FS, dropped caps |

## Pipeline hooks
- Unit tests: `cd backend && npm ci && npm test` (no DB needed)
- Run `cd backend && npm install` once and commit `package-lock.json` (needed for `npm ci` / SCA)
- SAST/secrets: `backend/src`, `frontend/public`; SCA: `backend/package.json`
- Image scan / SBOM: both Dockerfiles; lint: Dockerfiles + compose
- DAST: target http://localhost:3000 after `docker compose up -d`
- Smoke: `curl -f http://localhost:3000/api/tracks`
