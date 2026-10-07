# Feature: Movie catalog by studio (Disney first)

## Objective
A private web app for a group of friends to browse movie catalogs grouped by studio, mark movies as watched, score them (1–10), see a per-user "My Movie List" profile (MyAnimeList style) and a ranking of who watched the most movies.

## Problem / Why
The friends want a shared, private tracker. Disney (Walt Disney Animation Studios eras + Pixar) is the first catalog; more studios come later, so studios are data, not code.

## Scope (authorized)
- Repo layout: `api/` (PHP 8.2 backend, hexagonal) + `web/` (React + Vite + TypeScript SPA). One repo, deployable to PHP shared hosting (no Node at runtime).
- MySQL persistence (schema + seed). Tests use SQLite in memory (no local MySQL).
- Access: fixed shared site password + user tag. First login with an unknown tag registers it. PHP session cookie (httpOnly, SameSite=Lax).
- Posters: external links only (English Wikipedia `pageimages`, `upload.wikimedia.org`). Never stored locally. Placeholder when missing.
- Modern dark-mode UI.

## Constraints
- Artifacts (code, UI copy, comments, docs) in English.
- Secrets (DB credentials, site password hash) only in `api/config/config.php` (gitignored); commit `config.example.php`.
- Studios and catalog sections are data; adding a studio = seed rows only.
- Planning heuristic ~400 authored changed lines per task (advisory only).

## API contract (JSON, prefix `/api`)
- `POST /api/session` `{tag, password}` → `200 {user:{id,tag}}` | `401` bad password | `422` invalid tag. Registers tag if new.
- `GET /api/session` → `200 {user}` | `401`.
- `DELETE /api/session` → `204`.
- `GET /api/studios` → `[{slug,name,movieCount}]`.
- `GET /api/studios/{slug}/movies` → `{studio:{slug,name}, sections:[{slug,name,period,movies:[{id,title,originalTitle,year,posterUrl,watched,score,watchersCount,averageScore}]}]}` (watched/score for current user).
- `PUT /api/movies/{id}/entry` `{watched:bool, score:int|null}` → `200 entry`. Score 1–10 or null; score requires watched. `watched:false` removes the entry.
- `GET /api/ranking` → `[{tag, watchedCount, averageScore}]` ordered by watchedCount desc.
- `GET /api/users/{tag}/list` → `{user:{tag}, stats:{watchedCount,totalMovies,averageScore,scoreDistribution:{1..10}}, entries:[{movie, score, watchedAt}]}`.
- All endpoints except `POST /api/session` require session (`401`). Mutations require `Content-Type: application/json`.

## Tasks
- [x] T1-T3 — Backend (collapsed into one pragmatic layout after scope change): plain PHP front controller, PDO repository, session auth with shared site password, schema.sql, seed.sql with real poster URLs, bin/hash-password.php, bin/fetch-posters.php. Route: delegated (writer trigger). Commit 22865d9 (earlier layered scaffold dc455bd was collapsed).
- [x] T4 — Frontend: Vite React TS (login, catalog by section with search/filter/watched/score, ranking, profile), dark UI, no tests (TDD off). Route: delegated (writer trigger). Commit 03a07f3.
- [x] T5 — Deployment: docker-compose MySQL, deploy/.htaccess + api shim (backend outside web root), deploy/build.sh, README. Route: delegated (writer trigger). Commit c711d6e.

## Acceptance criteria
- Without login, no catalog data is reachable (API 401; SPA shows login).
- Wrong site password → rejected; right password + new tag → user created.
- A user can mark/unmark watched and set a 1–10 score; profile and ranking reflect it.
- Disney catalog shows all movies from the provided list grouped by era + Pixar, with posters from external URLs.

## Checks
- TDD: OFF (source: user, speed over ceremony). No test runner required.
- Checks: `php -l` on PHP sources + curl smoke test against `php -S` (SQLite); MySQL validation in Docker by the orchestrator. Web: `npm run build`.

## Delivery
- Branch `feat/disney-catalog`, work-unit commit per task (Conventional Commits). No remote yet: push/PR are the user's decision. Strategy: ask-on-risk (forecast exceeds ~400 lines; chain strategy asked before any PR).
- RDD: on (default). Assessment per work-unit commit.

## Progress
- Repo initialized (`5877495`), branch `feat/disney-catalog` created.

- T1-T3 done (22865d9). Smoke test (php -S + SQLite, 91 movies, 8 sections): 401 no session / wrong password, 422 bad tag, 415 no JSON type, login 200 (case-insensitive tag), catalog 200, PUT entry 200/422/404/415, ranking, user list, logout 204 then 401 all as expected. All 91 movies have poster URLs. `php -l`: 0 failures.

## Next step
Orchestrator: MySQL validation in Docker, RDD assessment, then user decides push/PR.

- T4/T5 done (03a07f3, c711d6e). `npm run build` (tsc -b + vite build) passes; `bash deploy/build.sh` assembles build/public + build/disney-app; shim include resolves the real front controller. No browser/MySQL run yet.
