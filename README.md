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

Weekly cron on Hostinger (hPanel > Advanced > Cron Jobs; the deploy layout puts the backend in `<webroot>/_app`):

```
0 5 * * 1 /usr/bin/php /home/<user>/domains/<domain>/public_html/_app/bin/refresh-providers.php --stale-days=6 >> /home/<user>/domains/<domain>/public_html/_app/storage/providers.log 2>&1
```

API (all behind the session):

- Every title object in `GET /api/studios/{slug}/movies`, `/api/home`, `/api/titles`, `/api/search` and `/api/users/{tag}/profile` (watched, pending and recommendation lists) carries `providers: [{id, type}]` (one entry per provider and type, `type` one of `flatrate|free|ads|rent|buy`, ordered by type then TMDB priority) and `providersLink` (TMDB watch page for the country, or `null`).
- `GET /api/studios/{slug}/movies` also returns a top-level `providers: {"<id>": {name, logoUrl}}` dictionary with the providers used in that payload. Other endpoints resolve ids with `GET /api/providers` (static, ETag): `[{id, name, logoUrl, titleCount, flatrateCount}]`, most used first; `?used=1` lists only providers with at least one title (for the filter UI).
- `GET /api/titles` filters: `provider=<id>[,<id>]` and `ptype=flatrate|rent|buy|any` (`flatrate` also matches `free` and `ads`; without `ptype` any type matches; `ptype` alone means "has any provider of that type").

Production runbook: back up, apply 006, upload `api/`, run `php _app/bin/refresh-providers.php` once (SSH, or a one-off cron with `--stale-days=0`), then add the weekly cron above.
