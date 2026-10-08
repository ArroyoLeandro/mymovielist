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
- [x] T11 (local) — Independent studios, animation and live action never mixed in a section (TMDB genre 16): disney (Disney Animación), disney-live-action, disney-xd (Jetix/Disney XD), lucasfilm, dreamworks, blue-sky, ghibli, marvel (MCU phases), sony, universal, warner (franchises via TMDB collections), cartoon-network, nickelodeon. Importer gained `collection` sources, multi-`sources` per section, `--move` (take over rows from another studio keeping ids/watch entries) and automatic removal of empty sections. Commits 53adffb, 5b3aaeb. Imported into the LOCAL docker DB only; prod untouched. Moves verified: test watch entries on rows moved between studios kept their ids; no duplicates or empty sections. Jetix has no TMDB network: uses Disney XD 44 + Toon Disney 142 + Jetix companies.
- [x] T12 — Section nav redesign (hidden scrollbar, edge fades, arrows, wheel-to-horizontal, scrollspy). Commit 0908bf3.
- [x] T13 — Ranking per studio (% completed), global movies/series split + studios led, group highlights endpoint and cards. Commit 4ec192f.
- [x] T14 — My list (/u/:tag) by studio: API entries carry studio/section/mediaType, stats.byStudio; UI studio chips + type filter + sort, collapsible studio groups, tags, per-studio bars. Commit 2814579.

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

- T14 done: php -l OK on Repository.php and index.php (php:7.4-cli); `npm run build` passes; local API list returns studio/section/mediaType per entry and stats.byStudio. No browser E2E run.

- Phase 2 deployed to prod (main @ f8209df): MariaDB migrated, 13 studios / 1456 titles, 325 watch entries identical. Backup backups/prod-20261007-184808-pre-deploy.sql.

### Phase 3 — Navigation, curation, sagas, new catalogs, profile (branch `feat/phase3-catalog`)
User decisions (2026-10-07): studio page = 3 tabs (Sagas as rows with progress, Películas, Series); curation keeps movies with ≥500 TMDB votes and series with ≥100, never deletes titles with watched/pending/recommended data, plus a manual always-keep list; home = global catalog in themed rows (most watched by the group, your pending, best rated by the group, popular sagas) + "Ver todo" grid with filters; current home moves to /estudios; global search in the header; back button; scroll-to-top on navigation + floating button; Anime category (series ≥200 votes or ≥100 if first aired before 2005, movies ≥500, excluding Ghibli; manual franchise map for series sagas); general Series (≥1000 votes) and Películas (≥5000 votes) organized by genre, deduplicated against studios; profile tabs Vistas / Pendientes / Recomendadas / Mis recomendaciones; recommend to 1+ friends with optional note, no notification/counter, show whether the friend watched it.
- [x] T15 — Curation: store TMDB vote_count/popularity/release_date, threshold filter in the importer (movies 500 / series 100, overridable), `--studio=all`, `--prune` (+ `--dry-run`) protecting rows referenced by user tables, always-keep list, WDAS `keep_all`. Migration 003. Route: delegated (writer A). Local DB: 1456 -> 920 titles, 325 watch entries identical per user.
- [x] T16 — Sagas: `collections` + `movies.collection_id` (TMDB belongs_to_collection, manual `franchises.php`), catalog API `sagas` + per-title `collection`, studio page tabs Sagas/Películas/Series with saga rows. Route: delegated (writer A).
- [x] T17 — New catalogs: Anime (510: 111 movies + 399 series), Series (418), Películas (766), studio order + kind (migration 004), Spanish saga names. Route: delegated (writer B). Local DB: 920 old titles untouched, 325 watch entries identical per user, idempotent re-run, prune dry-run removes nothing.
- [x] T18 — Navigation: `/` global home (themed rows from `GET /api/home`), `/estudios`, `/catalogo` grid (filters, 60 per page, infinite scroll, `GET /api/titles`), header search (`GET /api/search`, debounce 250 ms, accent-insensitive via utf8mb4_unicode_ci + PHP ranking prefix > word > contains), deep links `/studio/:slug?t=<id>` / `?saga=<slug>`, back button, scroll reset on PUSH / restore on POP, floating back-to-top, skeletons. Route: delegated (writer C). Commits 1380fbd (API), 42907f1, 37d4274.
- [x] T19 — Watchlist ("Quiero verla") + recommendations with optional note: migration 005, endpoints, profile tabs Vistas/Pendientes/Recomendadas/Mis recomendaciones (last two only on own profile), card actions and recommend modal. Route: delegated (writer C). Commits 1380fbd, 9351aa8.

- T18/T19 verification (local MariaDB 11.8 prod copy, backup backups/local-before-T18.sql): php 7.4 lint OK (Repository.php, index.php); `npm run build` passes; migration 005 applied twice (re-runnable); curl through :5173 as Kanji1: /api/home (6 rows, 20 items each), /api/search?q=harry (8) and ?q=senor finds "El señor de los anillos" (accent-insensitive), /api/titles?type=series&sort=popular (1052 total, 60 per page, hasMore), watchlist PUT/DELETE 204, marking watched removes the title from the watchlist, recommendation POST (note trimmed, 281 chars -> 422, self-only -> 422, other profile hides recommendation tabs), DELETE 204 then 404. Test rows removed: watch_entries per user identical (total 325), watchlist and recommendations empty. No browser E2E run (layout, mobile search and scroll behavior unverified visually).
- Prod runbook addition: apply migration 005 (see README), then deploy api + web build.
- T20 — Card/modal/score UX: compact card (poster + icon cluster, title, year, one group summary line), title detail modal with group stats and viewers (b14c054), segmented score meter. Route: delegated. `tsc -b` + `npm run build` pass; no browser E2E.
- [x] T22 (backend) — Where to watch in Argentina (TMDB watch providers, data by JustWatch): migration 006 (`providers`, `title_providers` keyed by `title_id` and excluded by name from the importer's protection check, `movies.providers_link/providers_updated_at`), `bin/refresh-providers.php` (stale-days, limit, studio, dry-run, no cache, lock file, exit codes, channel-variant hiding), per-title `providers: [{id,type}]` + `providersLink` on catalog/home/titles/search/profile, catalog `providers` dictionary, `GET /api/providers[?used=1]`, `/api/titles?provider=&ptype=`. TmdbClient reuses its curl handle (~3x faster). Route: delegated writer (backend only). Local run: 2614 titles in 490 s, 2356 with an AR provider (2207 by subscription), 258 without; importer `--studio=all --prune --dry-run` output identical before/after (0 protected/deleted changes). php 7.4 lint OK; curl OK (catalog dictionary + 304, providers 401 without session, Netflix flatrate 487 titles). Watch entries untouched by this task (the count moved 325 -> 326 during the run from concurrent UI use by Kanji1, not by these scripts).
- [x] T22 (frontend) — Where to watch on the web: card logo row under the meta line (subscription logos max 3 + "+N", mint "Gratis" capsule for free/ads, muted "Alquiler/compra" pill with grey logos when only rent/buy; fixed-height row so cards stay equal), "Dónde verla" section in the title modal (Suscripción / Gratis con anuncios / Alquiler / Compra, TMDB link, JustWatch attribution, empty state), "Plataforma" multi-select popover (bottom sheet on phones, search when > 12) on /catalogo (`provider=`/`ptype=` in the URL, removable chips) and on the studio toolbar (client-side), logo row on profile rows. Global dictionary from `GET /api/providers?used=1` merged with the catalog dictionary via context; styles in `providers.css`. Type filter offers Cualquiera/Suscripción/Alquiler/Compra (the API has no combined rent-or-buy value). Route: delegated writer (frontend only). Commit 5c7d7d5. `tsc -b` + `npm run build` pass (CSS 56.6 kB / 12.5 kB gz, JS 392.3 kB / 120.6 kB gz, includes T23); headless Chrome at 320/360/1280: no horizontal overflow, equal card heights (341/371/477 px); `/api/titles?provider=8&ptype=flatrate` = 487.
- Prod runbook addition (T22): back up, apply migration 006, upload `api/`, run `bin/refresh-providers.php` once (~10 min), add the weekly cron from the README.
- T21 — Design polish (Opus): stylesheet rebuilt on tokens (space, radius, type, color) with a global button reset and `.btn` primary/ghost/quiet/icon variants; carousels removed in favor of wrapping grids (home sections capped at 10, trimmed to whole rows); cards ~40% larger via `--card-w` (224/200px, 2 columns on phones), compact icon cluster per breakpoint; studio page tabs Todas (default)/Películas/Series/Sagas in `?tab=` (Películas/Series include saga titles, `?t=` opens Todas), sticky toolbar under the header (measured `--header-h`/`--toolbar-h`, IntersectionObserver stuck state) also on /catalogo; responsive header (tablet two rows, phone search icon); shared `useDialog` (focus trap/restore) for both dialogs, bottom sheets on phones; keyboard tabs; error states with retry and friendly empty states; matching skeletons; reduced-motion for JS scrolling. Route: delegated (single writer). Commits 53af71f, 452cd69, 99f5982, c153684, 69b9c4a, 722af97. `tsc -b` + `npm run build` pass (CSS 38.5 kB / 9.0 kB gz, JS 371.8 kB / 114.3 kB gz); no browser E2E (layouts at 360/768/1280 reasoned, not seen).
- [x] T23 — Ranking redesign: podium hero (initials avatars with per-tag color, medal steps on a shared floor, crown, entrance motion respecting reduced motion), compact leaderboard (bar relative to leader, own row highlighted), highlights in one card anatomy on an orphan-free grid (side column >=1100px), searchable studio picker + type filter on one line, matching skeletons, scope-aware empty states; `html, body { overflow-x: clip }` safety net and profile skeleton fix for 320px. Route: delegated (single writer). Commit c38575e. `tsc -b` + `npm run build` pass; headless Chrome screenshots at 320/360/390/640/768/1280/1920 show no element past the viewport.

## Next step
T15–T16 (writer A), then T17 (writer B), then T18–T19 (writer C); local test on a prod copy; user confirms before deploy.
