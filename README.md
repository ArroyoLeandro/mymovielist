# Movie Nights

A private movie tracker for a group of friends. Browse catalogs by studio (Disney first), mark movies as watched, score them 1-10, see everyone's "My Movie List" and a ranking of who watched the most.

- `api/` - PHP 7.4+ backend (plain front controller + PDO, MySQL).
- `web/` - React + Vite + TypeScript SPA.
- `deploy/` - web-root `.htaccess`, `/api` shim and `build.sh` for shared hosting.

Access is a shared group password plus a user tag. An unknown tag is registered on first login. Posters are hotlinked from Wikimedia, never stored.

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

1. Create a subdomain, e.g. `movies.example.com`. Create a MySQL database and user in hPanel and import `api/database/schema.sql` then `api/database/seed.sql` (phpMyAdmin).
2. Run `bash deploy/build.sh`. It produces:
   - `build/public/` - the web root contents (SPA, `.htaccess`, `api/index.php` shim) plus `_app/`, the backend.
3. Upload everything in `build/public/` (including the hidden `.htaccess` files) into the subdomain's web root. `_app/` stays inside the web root because shared hosting uploads cannot go above it; both `.htaccess` files deny every request to it (verify `/_app/config/config.php` returns 403).
4. Subdomains on shared hosting usually inherit the parent domain's PHP version; the code runs on PHP 7.4+, so there is no need to change it.
5. On the server, copy `_app/config/config.example.php` to `config.php`, set the real DB name/user/password (host `localhost`) and generate `site_password_hash` with `php bin/hash-password.php "password"` (run it locally, paste the hash).
6. Open the subdomain, log in. Enable HTTPS in hPanel so the session cookie is protected.

## Add a new studio

Studios, sections and movies are data. Add rows to `api/database/seed.sql` (or run equivalent SQL on the server):

```sql
INSERT INTO studios (id, slug, name) VALUES (2, 'ghibli', 'Studio Ghibli');
INSERT INTO sections (id, studio_id, slug, name, period, sort_order) VALUES (9, 2, 'films', 'Films', '1986-present', 1);
INSERT INTO movies (id, section_id, title, original_title, year, wiki_title, sort_order)
VALUES (92, 9, 'Spirited Away', NULL, 2001, 'Spirited Away', 1);
```

Then fill in poster URLs from English Wikipedia (uses `wiki_title`):

```bash
cd api && php bin/fetch-posters.php
```

Open `/studios/ghibli`. The nav links to `/studios/disney`; add a link in `web/src/App.tsx` for the new studio.
