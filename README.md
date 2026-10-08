# Movie Nights

A private movie tracker for a group of friends. Browse catalogs by studio (Disney first), mark movies as watched, score them 1-10, see everyone's "My Movie List" and a ranking of who watched the most.

- `api/` - PHP 7.4+ backend (plain front controller + PDO, MySQL).
- `web/` - React + Vite + TypeScript SPA.
- `deploy/` - web-root `.htaccess`, `/api` shim and `build.sh` for shared hosting.

Access is a shared group password plus a user tag. An unknown tag is registered on first login. Posters are hotlinked from TMDB, never stored.

## Local setup

Requirements: Docker, PHP 7.4+ (with `pdo_mysql`), Node 20+.

```bash
docker compose up -d                       # MySQL 8.4 with schema + seed (dev credentials only)

cd api
cp config/config.example.php config/config.php
php bin/hash-password.php "your group password"   # paste the output into site_password_hash
php -S localhost:8000 -t public            # API on :8000

cd ../web
npm install
npm run dev                                # http://localhost:5173, /api is proxied to :8000
```

The seed only runs on the first start of the database volume. To reset: `docker compose down -v && docker compose up -d`.

## Deploy to Hostinger (shared hosting, no Node needed)

1. Create a subdomain, e.g. `movies.example.com`. Create a MySQL database and user in hPanel and import `api/database/schema.sql` then `api/database/seed.sql` (phpMyAdmin), or, for an existing database, apply `api/database/migrations/002_tmdb.sql` instead. Then run the TMDB importer (see below) from a machine that can reach the database (or on the server if SSH is available).
2. Run `bash deploy/build.sh`. It produces:
   - `build/public/` - the web root contents (SPA, `.htaccess`, `api/index.php` shim) plus `_app/`, the backend.
3. Upload everything in `build/public/` (including the hidden `.htaccess` files) into the subdomain's web root. `_app/` stays inside the web root because shared hosting uploads cannot go above it; both `.htaccess` files deny every request to it (verify `/_app/config/config.php` returns 403).
4. Subdomains on shared hosting usually inherit the parent domain's PHP version; the code runs on PHP 7.4+, so there is no need to change it.
5. On the server, copy `_app/config/config.example.php` to `config.php`, set the real DB name/user/password (host `localhost`) and generate `site_password_hash` with `php bin/hash-password.php "password"` (run it locally, paste the hash).
6. Open the subdomain, log in. Enable HTTPS in hPanel so the session cookie is protected.

## Catalog data: TMDB importer

Studios, sections and titles come from [TMDB](https://www.themoviedb.org/). Titles use Mexican Spanish first (es-MX translation, then MX/other LATAM alternative titles, then es-ES, then the original title), posters use the Spanish/LATAM poster when one exists. Posters and logos are hotlinked from `image.tmdb.org`, never stored. The precedence is documented in `api/src/TmdbResolver.php`; manual title fixes go in `api/database/studios/title-overrides.php`.

1. Get a TMDB API key (https://www.themoviedb.org/settings/api) and put it in `api/config/config.php`:
   `'tmdb' => ['api_key' => '...']` (v3 key) or `['read_token' => '...']` (v4 bearer token). On Windows PHP you may also need `'ca_bundle' => 'path/to/cacert.pem'` (or the `SSL_CERT_FILE` env var).
2. Apply `api/database/migrations/002_tmdb.sql` once to an existing database (adds `media_type`, `tmdb_id`, `studios.logo_url`). Fresh databases already get it from `schema.sql`.
3. Link the 91 originally seeded rows to TMDB (keeps everyone's watched entries), then import:

```bash
cd api
php bin/import-tmdb.php --match-existing --dry-run     # preview; drop --dry-run to apply
php bin/import-tmdb.php --studio=disney --dry-run      # preview every insert/update, nothing is written
php bin/import-tmdb.php --studio=disney                # upsert by (media_type, tmdb_id)
```

The import is repeatable. It never deletes rows that have watch entries; rows no longer in the definition are listed as "orphaned" (`--prune` deletes orphans without entries). Other flags: `--emit-seed=path` writes the resolved studio as SQL (for seeding a fresh local DB), `--no-cache` skips the 24 h response cache in `api/storage/tmdb-cache`, `--verbose` prints every change.

### Add a new studio

Create `api/database/studios/<slug>.php` (see `disney.php`): studio slug/name/logo plus ordered sections, each with a Spanish name, a period label and a source, either `discover` (TMDB discover params such as `with_companies`, `with_networks`, `with_genres`, release-date ranges) or an explicit `ids` list, with optional `exclude_ids`. Then run `php bin/import-tmdb.php --studio=<slug>`. The studio appears on the home page automatically.

## API caching

`GET /api/studios` and `GET /api/studios/{slug}/movies` are static: they carry an `ETag` and `Cache-Control: private, no-cache` and answer `If-None-Match` with `304`. Everything per user or social (`/ratings`, `/me/progress`, `/ranking`, entries) is `no-store`. The SPA uses TanStack Query: static data is cached for an hour, ratings are polled every 8 s and the ranking every 15 s, only while the tab is visible.

### Curation and sagas (migration 003)

Apply `api/database/migrations/003_curation.sql` once (MariaDB; adds `movies.release_date/vote_count/popularity/collection_id` and the `collections` table; re-runnable). Then:

```bash
cd api
php bin/import-tmdb.php --studio=all                    # fills votes/popularity/collections for every studio
php bin/import-tmdb.php --studio=all --prune --dry-run  # preview: per-studio before/after and what would be deleted
php bin/import-tmdb.php --studio=all --prune            # delete titles below the thresholds
```

Thresholds: movies >= 500 TMDB votes, series >= 100 (override with `min_votes` on a studio, section or source). Never filtered nor pruned: titles with watch entries (or any table with a `movie_id` column), `api/database/studios/always-keep.php`, and sections with `'keep_all' => true` (the WDAS canon). Sagas come from TMDB `belongs_to_collection` plus the manual `api/database/studios/franchises.php` (mainly series); a saga in the UI is any collection with 2+ titles in the studio.

### Anime, Series, Películas and studio order (migration 004)

Apply `api/database/migrations/004_studio_order.sql` once (adds `studios.sort_order` and `studios.kind`; re-runnable). Display order and kind (`studio` or `category`) per studio live in `api/database/studios/studio-order.php` and are written by the importer. Three catch-all categories complete the catalog and are always imported after the studios, so a title already owned by a studio is never duplicated:

- `anime`: Japanese animation, sections by era; series >= 200 votes (>= 100 if aired before 2005), movies >= 500, without Studio Ghibli.
- `series`: live-action series >= 1000 votes, sections by primary genre.
- `peliculas`: live-action movies >= 5000 votes, sections by primary genre; sagas come from TMDB collections.

```bash
cd api
php bin/import-tmdb.php --studio=anime --dry-run
php bin/import-tmdb.php --studio=all     # studios first (disney-xd leads), then anime, series, peliculas
```

Spanish saga names: the importer asks TMDB for the es-MX collection name (then any Spanish translation, then the original); fixes go in `api/database/studios/saga-names.php` (`collection:<tmdb id>` or franchise slug).

### Watchlist and recommendations (migration 005)

Apply `api/database/migrations/005_watchlist_recommendations.sql` once (creates `watchlist` and `recommendations`; additive and re-runnable, no data is touched). Both tables keep a `movie_id` column, so the importer's `--prune` never removes a pending or recommended title. Deploy order on production: back up, apply 004 (if pending) and 005, upload the new `api/` and `web` build. The new endpoints (`/api/home`, `/api/titles`, `/api/search`, `/api/users`, `/api/users/{tag}/profile`, watchlist and recommendations) replace `/api/users/{tag}/list`.

### Where to watch in Argentina (migration 006)

Streaming/rent/buy availability comes from TMDB watch providers (data by JustWatch) for one country: `tmdb.watch_country` in `config.php`, default `AR`. Apply `api/database/migrations/006_watch_providers.sql` once (creates `providers` and `title_providers`, adds `movies.providers_link` and `movies.providers_updated_at`; additive and re-runnable). `title_providers` uses a `title_id` column on purpose and is excluded by name from the importer's protection check: provider rows never keep a title from being pruned, and pruning a title deletes its provider rows (cascade).

```bash
cd api
php bin/refresh-providers.php --dry-run --limit=20   # preview, nothing written
php bin/refresh-providers.php                        # titles never fetched or older than 7 days (all ~2600 on the first run, ~10 min)
```

Flags: `--country=AR`, `--stale-days=7` (0 = every title), `--limit=N`, `--studio=<slug>`, `--dry-run`, `--verbose`. No response cache (providers change weekly). A title without data for the country gets no rows but its timestamp is set, so it is retried only when stale. Channel/tier duplicates (e.g. "Crunchyroll Amazon Channel" next to "Crunchyroll" for the same type) are hidden. A lock file in `api/storage/` prevents overlapping runs. Exit codes: 0 ok, 1 error or some titles failed, 2 bad arguments, 3 another run in progress.

On production the providers refresh runs inside the weekly sync (see "Automatic catalog growth" below); the old providers-only cron is replaced by it.

API (all behind the session):

- Every title object in `GET /api/studios/{slug}/movies`, `/api/home`, `/api/titles`, `/api/search` and `/api/users/{tag}/profile` (watched, pending and recommendation lists) carries `providers: [{id, type}]` (one entry per provider and type, `type` one of `flatrate|free|ads|rent|buy`, ordered by type then TMDB priority) and `providersLink` (TMDB watch page for the country, or `null`).
- `GET /api/studios/{slug}/movies` also returns a top-level `providers: {"<id>": {name, logoUrl}}` dictionary with the providers used in that payload. Other endpoints resolve ids with `GET /api/providers` (static, ETag): `[{id, name, logoUrl, titleCount, flatrateCount}]`, most used first; `?used=1` lists only providers with at least one title (for the filter UI).
- `GET /api/titles` filters: `provider=<id>[,<id>]` and `ptype=flatrate|rent|buy|any` (`flatrate` also matches `free` and `ads`; without `ptype` any type matches; `ptype` alone means "has any provider of that type").
- `GET /api/titles` pages (60 titles) use keyset pagination: each response carries `hasMore` and `nextCursor` (opaque, `null` on the last page); pass it back as `cursor=` with the same filters and sort for the next page. The next page starts strictly after the last title sent, so friends marking or scoring titles meanwhile never make a page repeat an earlier title (a title that moves up past the cursor is skipped instead; the web client also drops any id it already has). A malformed cursor or one from another sort answers `422 {code: 'bad_cursor'}`. `page=N` without a cursor still works (offset) for clients loaded before this change.
- `GET /api/home`: a title appears in at most one row. "Te recomendaron" and "Tus pendientes" claim their titles first, then the other rows in display order; a row skips titles already used and backfills from further down its own list, keeping up to 20 items.

Production runbook: back up, apply 006, upload `api/`, run `php _app/bin/refresh-providers.php` once (SSH, or a one-off cron with `--stale-days=0`).

### Dismissing received recommendations (migration 007)

Apply `api/database/migrations/007_recommendation_dismiss.sql` once (adds `recommendations.dismissed_at`; additive and re-runnable, no data is touched). `POST /api/recommendations/{id}/dismiss` hides a received recommendation for its recipient (403 for anyone else, 404 if unknown) and `DELETE /api/recommendations/{id}/dismiss` undoes it; the sender still sees it (with `dismissed: true`) and re-sending it brings it back. Production runbook: back up, apply 007, upload `api/` and the `web` build.

### Automatic catalog growth (migration 008, weekly sync)

Apply `api/database/migrations/008_catalog_growth.sql` once (adds `movies.added_at`, `movies.source` `rule|manual` and `movies.added_by_user_id` FK to `users` ON DELETE SET NULL; additive and re-runnable; existing rows get `added_at = 2026-01-01` so they never flood the "recent" row).

Curation rules (`api/src/CatalogImporter.php`, overridable with `'catalog' => [...]` in `config.php`):

- Normal thresholds as before (movies 500 votes, series 100; categories: Películas 5000, Series 1000, Anime 200/500).
- Recent releases (released in the last 12 months) enter with a relaxed threshold `max(floor, normal x 0.1)`: floors 50 votes for movies and 20 for series, so studios need 50/20, Películas 500, Series 100, Anime 20/50. A movie trending right now (TMDB popularity >= 150 and >= 20 votes) also enters. Discover sources that ask TMDB for more votes get an extra pass over the last 12 months (most popular first) with the relaxed count. Checked against TMDB on 2026-10-08: the first run added 252 titles (102 Películas, 82 Series, 61 Anime, 7 in studios). Popularity alone was not used as an entry rule: TMDB lists zero-vote titles with popularity above 100.
- Prune never removes titles released in the last 18 months (grace), titles added by hand (`source = 'manual'`) or titles with user data (watch entries, watchlist, recommendations) or in `always-keep.php`. After 18 months a title must meet the normal threshold. `--max-prune=N` skips a studio whose prune would delete more than N rows.
- The WDAS "Resurgimiento" section also discovers new Walt Disney Animation Studios features (company 6125, animation, >= 40 min, since 2009) next to the explicit canon.
- New rows get `added_at`; `GET /api/home` starts with "Estrenos y agregadas recientemente" (added in the last 30 days, newest day first, hand-added first; omitted when empty) and `GET /api/titles?sort=added` lists the same order.
- The TMDB disk cache (`storage/tmdb-cache`, gzip) keeps responses 6 days, so every weekly run fetches fresh discover pages and details; files older than 7 days are deleted when a sync starts.

`bin/weekly-sync.php` runs the whole sync in one process: import every studio (in import order), prune (skipped if an import step failed; at most 25 deletions per studio, `catalog.max_prune`), refresh watch providers older than 6 days. One line per step goes to stdout, the detailed log of the last run to `storage/weekly-sync-detail.log`. It shares a lock with `/admin` (a run without progress for 15 min frees it). Exit codes: 0 ok, 1 a step failed, 2 bad arguments, 3 another sync holds the lock. Flags: `--mode=full|import|providers`, `--stale-days=6`, `--limit=N` (providers), `--config=path`.

Cron (hPanel > Advanced > Cron Jobs), Mondays 04:00, replacing the old providers-only cron:

```
0 4 * * 1 /usr/bin/php /home/u465057680/domains/sistemasfa.com/public_html/mymovielist/_app/bin/weekly-sync.php >> /home/u465057680/domains/sistemasfa.com/public_html/mymovielist/_app/storage/weekly-sync.log 2>&1
```

A full run takes about 1 minute with a warm cache; with a cold cache (first run, or weekly) a few minutes, mostly provider refreshes (~2900 titles at ~25/s).

### Adding missing titles by hand ("¿No está? Agrégalo")

- `GET /api/tmdb/search?q=` (session): TMDB movies and series in es-MX, up to 12 `{tmdbId, mediaType: movie|series, title, originalTitle, year, posterUrl, voteCount, released, inCatalog: {id, studioSlug}|null, excluded}`. Titles and posters are resolved like the importer (LATAM first). 20 searches per minute per session (`429 {code: 'rate_limited', retryAfter}`), TMDB responses cached 24 h.
- `POST /api/titles/import {tmdbId, mediaType}`: `201 {created: true, title, studio: {slug, name, kind}}`, or `200 {created: false, ...}` when the title is already in the catalog (idempotent; unique `media_type + tmdb_id`). `422 {code: 'unreleased'}` for titles not released yet, `422 {code: 'excluded'}` for titles listed in (or produced by a company listed in) `exclusions.php`, `404 {code: 'not_found'}` when TMDB does not know it, `502 {code: 'tmdb_unavailable'}`. Placement: the first studio section whose definition source matches the title (companies, networks, genres, language, dates, collections, explicit ids; vote counts ignored); else a studio that produced it (keeping animation and live action apart) in an "Agregadas por el grupo" section created on demand; else the category for its type (anime = animation + Japanese, series, peliculas), in the matching section or "Agregadas por el grupo". The row gets `source = 'manual'`, `added_by_user_id` and `added_at`, and its Argentina providers are fetched right away. Title payloads carry `addedBy` (tag) for manual titles.

### Admin: sync on demand (`/admin`)

Shared hosting has no `exec()` and cuts long requests, so the page drives the sync one step per request (`src/CatalogSync.php`, the same steps the cron runs; each request is time-boxed to 40 s of TMDB work and answers `partial` when the step must continue).

Setup: `php bin/hash-password.php "<admin password>"` and put the hash in `admin_password_hash` in `config.php` (a different password from the site one). Without it the endpoints answer 503.

- `POST /api/admin/unlock {password}`: unlocks for 30 min (sliding). Failures wait 800 ms; after 5 the session is locked out for 10 min (429).
- `GET /api/admin/status`: `{unlocked}` and, when unlocked, `running` (live run or null), `lockExpiresIn`, `lastRun` (steps with results and totals) and step counts per mode.
- `POST /api/admin/sync/start {mode: full|import|providers, limit?, staleDays?}` (409 `locked` while the cron or another run holds the lock), `POST /api/admin/sync/step {runId, index}`, `POST /api/admin/sync/finish {runId, cancelled?}`.

### Production runbook (T25-T27)

1. Back up the database.
2. Apply `api/database/migrations/008_catalog_growth.sql`.
3. Add `admin_password_hash` to the server's `config.php` (generate it locally with `php bin/hash-password.php`).
4. Upload `api/` (new `src/` classes, `bin/weekly-sync.php`, `public/index.php`) and the `web` build.
5. Replace the providers cron with the weekly-sync cron above.
6. Optionally run the first sync from `/admin` ("Sincronizar todo") and watch it; otherwise the cron does it on Monday.

### Duplicates, mockbusters and pilots (migration 009)

- `api/database/studios/exclusions.php` lists what no studio or category ever imports: production companies (The Asylum, TMDB company 1311, and its affiliates 152189 / 282681: mockbusters such as the 2026 "The Odyssey" that entered Películas under the recent-release rule) and single titles (`movie:<id>` / `tv:<id>`, e.g. the Batman Beyond and Star Wars Rebels pilot movies). Companies are sent as `without_companies` to every discover call and also checked against each title's details, so collection and `ids` sources are covered too. Excluded rows already in the catalog become orphans (pruned unless protected), so merge them first. Manual additions refuse them too (`422 excluded`), and `GET /api/tmdb/search` marks them `excluded: true` (shown as "Excluido del catálogo" instead of the add button).
- Pilot TV movies duplicating their series: sections that discover movies should exclude genre 10770 (TV Movie), as the Lucasfilm animated films now do; pilots TMDB does not tag go in `exclusions.php`.
- Remakes that share a Spanish title are different titles: never merge them.
- `php bin/merge-titles.php --from=<id> --to=<id> [--dry-run] [--allow-cross-media]` merges a duplicate into the title that stays, in one transaction: watch entries move (when the user has both: highest non-null score, earliest date), watchlist is a union (earliest date), recommendations move (same sender and recipient on both: earliest date, dismissed only if both were), then the duplicate and its provider rows are deleted. It refuses equal or missing ids, different media types without `--allow-cross-media` (a pilot movie into its series) and unknown tables that reference titles. `--dry-run` runs everything and rolls back. Always exclude the merged title from the importer too, or the next sync adds it back.

Production runbook (S1, no SSH: phpMyAdmin):

1. Back up the database (phpMyAdmin > Export).
2. Upload `api/` first (exclusions, importer, studio definitions): an import with the old code after step 3 would add the duplicates back.
3. Run `api/database/migrations/009_merge_duplicates.sql` in phpMyAdmin's SQL tab. It merges #3330 -> #3331 (The Asylum's "The Odyssey" into Nolan's), #901 -> #1155 (Batman Beyond movie into the series) and #649 -> #125 (Star Wars Rebels pilot into the series) with the rules above, moves the Waverly Place movies into the `waverly-place` saga and renames the TMDB collection 8945 to "Mad Max". Every row is matched by id and TMDB id, so it cannot touch other titles, and running it again changes nothing. The final `SELECT` must show `0, 1, 0, 1`.

### Title type and other versions (migration 010)

Remakes, reboots and adaptations often share their Spanish title ("La Bella y la Bestia" 1991 and 2017). They stay separate titles (people track them separately); two things make them read as different versions:

- Type label: every title payload (`GET /api/studios/{slug}/movies`, `/api/home`, `/api/titles`, `/api/search`, `/api/users/{tag}/profile`, versions) carries `animated: true|false|null` (TMDB genre 16, Animation; `null` until the importer has seen the title), stored in `movies.animated`. Cards, profile rows, the header search and the detail show "Animada" or "Acción real" for movies and "Serie" or "Serie animada" for series (a movie with `animated: null` gets no label). The importer sets it on every title it resolves, on the studio rows it keeps without resolving them (protected orphans, titles added by hand; details from the disk cache when possible) and on manual imports, so the weekly sync fills any row the migration did not know.
- `GET /api/titles/{id}/versions` (session): the other versions of a title, oldest first, in the global title shape with the viewer's `state` (`404` for an unknown id, `[]` when there are none). Two titles are versions when the Spanish or original title of one has the same version key as the Spanish or original title of the other: lowercase without accents, letters and digits only, a leading Spanish article (el, la, los, las, un, una) dropped; keys shorter than 4 characters never match ("Z", "Up", "It"). English articles are kept on purpose ("The Gifted" is not "Gifted"). Computed at read time over every title (about 20 ms for ~3000 titles, states included), so renames apply right away; the web client caches it 10 minutes and patches it in place after an action. The title modal lists them under "Otras versiones" (poster, title, year, type, own state); each opens in the same modal. Unrelated titles that share a title ("El novato" / "The Rookie" series, two unrelated "Invasión") are unlinked by listing the pair in `api/database/studios/not-versions.php` (`['movie:<tmdb_id>', 'tv:<tmdb_id>']`, any order; uploading the file is enough, no SQL). Sequels named like the original ("Halloween" 2018) still show up.

Production runbook (S3, phpMyAdmin):

1. Back up the database (phpMyAdmin > Export).
2. Run `api/database/migrations/010_title_animation.sql` in phpMyAdmin's SQL tab before uploading the code (the new code reads `movies.animated`; the old code ignores it). It adds the column and fills it for every title of the 2026-10-08 prod copy by `media_type` + `tmdb_id` (only rows still `NULL`, so running it again changes nothing). The final `SELECT` lists titles per type: `NULL` remains only for titles added after that copy.
3. Upload `api/` and the `web` build.
4. Optionally run "Sincronizar todo" from `/admin` to fill the remaining `NULL` rows now; otherwise the Monday cron does it.

### Trailers (no migration)

The group watches with the original audio, so the title modal links up to two YouTube trailers (new tab), between the score and "Dónde verla": "Tráiler" in the title's original language (TMDB `original_language`) or, when TMDB has none and the original language is not English, an English one labeled "Tráiler (inglés)"; then "Tráiler latino" when a Latin-American Spanish dub exists. Nothing is shown while loading, on errors or without trailers.

- `GET /api/titles/{id}/extras` (session; `/api/titles/{id}/trailers` is the same endpoint under its first name, kept for web builds still open in a browser): `{original: {key, name, lang, fallback} | null, latino: {key, name} | null, overview: string | null, overviewLang: 'es-MX' | 'es-ES' | 'en' | null}` (`key` = YouTube id, watch URL `https://www.youtube.com/watch?v=<key>`; synopsis: see below; `404` for an unknown id). Cached like the static endpoints (`ETag`, `private, no-cache`, `304`). When TMDB fails or is slow (no new request or retry after 5 s), it answers `200` with every field `null` and `unavailable: true`, with `no-store`, and logs the error; the client asks again on the next open of that title.
- Fetched on demand, nothing stored in the database: one TMDB details request with English and Latin-American Spanish videos appended and `language=es-MX` (it also gives `original_language` and the synopsis), plus one videos request in the original language (with its countries of origin) when that is not English. They stay 6 days in the disk cache (`storage/tmdb-cache`), so a title costs TMDB at most two requests a week (four with both synopsis fallbacks); cache hits answer in a few ms. The web client keeps a title's answer for the session.
- TMDB filters videos by locale and the bare `es` only matches Spain, so Latin-American videos are requested as `es-MX`, `es-AR`, ... `es-419`, `es-US`; any Spanish video whose region is not `ES` counts as Latin American. Videos named as subtitled ("[Subtitulado]") keep the original audio and never count; dubbed ones ("[Doblado]") win. No "Tráiler latino" for Spanish-language titles.
- Choice per link: YouTube only, type Trailer before Teaser, official first, then the newest published up to the release (or first air) date, i.e. the final launch trailer; when none was published by then, the oldest later one (skips re-release, "encore" and later-season trailers); larger size breaks ties.

Production: upload `api/` (new `src/Trailers.php`, `src/Repository.php`, `src/TmdbClient.php`, `public/index.php`) and the `web` build, in any order (the old web build never calls the endpoint). `storage/tmdb-cache` must stay writable, as for the importer.

### Synopsis (no migration)

The title modal shows the TMDB synopsis under the title and year, clamped to four lines, with "Ver más" / "Ver menos" only when the text overflows. It comes in the same answer as the trailers (`overview`, `overviewLang` above).

- Language: Latin-American Spanish (`es-MX`, set on the details request; adding `language` does not change the videos, which follow `include_video_language` only: same video sets on 110 titles). TMDB does not fall back between translations (a missing one is an empty overview), so an empty one asks for Spain's (`es-ES`), then English (`en-US`): plain details requests, only when needed, cached like the rest. An English synopsis carries a muted "(en inglés)" note. No synopsis in any of the three: nothing is shown.
- Layout: while the answer loads, a skeleton holds four lines plus the "Ver más" row, and the text keeps that height when it arrives, so the actions row never moves under the user's finger. A title opened again in the session answers from the client cache and takes only its own height. Without a synopsis (or on a TMDB failure) the skeleton collapses.

Production: upload `api/` (new `src/TitleExtras.php`; changed `src/Trailers.php`, `src/Repository.php`, `public/index.php`) and the `web` build, in any order: the old web build keeps calling `/trailers` and ignores the new fields; the new build calls `/extras`.
