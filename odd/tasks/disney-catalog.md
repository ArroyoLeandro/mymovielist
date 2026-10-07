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
- [x] T6 — Friends' ratings per movie + polling + one-tap scoring UX. Commits 5a80054, c5faef8. Deployed.
- [x] T7 — Session lifetime + stale-poll guard. Commits 2480b9d, c356294. Deployed.

### Phase 2 — TMDB catalog (branch `feat/tmdb-catalog`)
User request (2026-10-07): all Disney studios under `/disney`; every movie (existing + new) uses Latin-American Spanish title and LATAM poster (e.g. Inside Out = "Intensamente", not "Del revés"); skeleton loading states; podium top-3 in ranking; then independent studios with the same criteria: DreamWorks, Sony, Blue Sky, Ghibli, Warner, Universal, Marvel, Cartoon Network, Jetix/Disney XD, Nickelodeon, Disney live-action series.
- [x] T8 — Skeleton loaders (catalog, ranking, profile) + ranking podium (classic stepped podium, #1 center tallest). Route: delegated (writer trigger). Commit 9ac7393 (UI copy translated to Spanish).
- [x] T9 — Data model for multi-source catalogs: media type movie/series, `tmdb_id`, per-section source definition; lightweight ratings polling endpoint (big catalogs must not re-download everything every 8 s); catalog UI scales to hundreds of titles (section nav/collapsible, lazy images). TMDB importer `bin/import-tmdb.php` driven by a studio definition file, title/poster resolution LATAM-first (AR alternative title → es-MX → es-ES → original). Route: delegated (writer trigger). Blocked for live run on TMDB API key (user is getting it). Done with live TMDB key: commits 5b7ffb8 (model + importer), c7e11cf (static/ratings/progress endpoints + ETag), cc1b388 (web: scale catalog, studios home, react-query).
- [ ] T10 — Run import for Disney (WDAS eras, Pixar, Walt Disney Pictures live-action, DisneyToon, Disney Channel movies, Lucasfilm), re-map existing watch entries by tmdb_id, deploy + migrate prod without losing user data.
- [ ] T11 — Independent studios with the same criteria (scope per studio to confirm for very large catalogs: Warner, Universal, Sony).

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

- T4/T5 done (03a07f3, c711d6e). `npm run build` (tsc -b + vite build) passes; `bash deploy/build.sh` assembles build/public + build/disney-app; shim include resolves the real front controller.
- Orchestrator validation on MySQL 8.4 (Docker): schema+seed load clean (91 movies, 8 sections, 0 missing posters, accents OK); API smoke test against MySQL OK (login, PUT entry, ranking, user list, catalog). Full local stack via `docker compose` + `php -S` + Vite proxy: SPA 200, `/api/session` 401 → login 200, catalog 200.

- T6 done (route: delegated; 5a80054 ratings+polling, c5faef8 scoring UX). php -l OK on Repository.php and index.php (php:7.4-cli); npm run build passes.
- T7 done (route: delegated; 2480b9d session lifetime + private save path + sliding cookie, c356294 stale-poll guard). php -l OK (php:7.4-cli); npm run build passes.

- T8/T9 (+ added scope: studios home with logos, static/dynamic API split with ETag/304, react-query) done, route: delegated writer. Verification: php -l OK on php:7.4-cli for all changed PHP; `npm run build` passes; live `import-tmdb --studio=disney --dry-run` OK (425 titles: 91 existing updated in place, 334 new; 0 orphans; re-run is idempotent = 425 unchanged); `--match-existing` 91/91; migration 002 applied on a prod-like DB (old schema, 91 movies, 4 watch entries): entries and ids survive, re-run fails harmlessly; fresh volume schema+seed OK; curl: 200 + ETag then 304 on /api/studios and /movies, 401 without session, /ratings and /me/progress no-store. No browser E2E of the new SPA was run. No TMDB ids left as TODO; review the live-action (companies 2|3166, vote_count>=50) and Disney Channel (240533|241787 + genre 10770) lists. Manual override: movie:1084244 (Toy Story 5; TMDB's only LATAM alt title was Quechua). Web work shipped in commits 9ac7393, cc1b388; docs 8e8d078 (the separate `perf:` commit was folded into c7e11cf and cc1b388).

## Next step
User tests in the browser locally. Then deploy to Hostinger subdomain via MCP (pending explicit user request + subdomain). RDD review deferred: user asked for speed and validation at the end.
