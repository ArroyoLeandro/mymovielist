# Feature: Dependent catalog filters and seen-filter consistency

## Objective
Make the `/catalogo` filters coherent with each other: the studio picker only offers studios that have content of the chosen type, it no longer offers type-like pseudo-studios, and a card that stops matching the active seen filter leaves the list.

## Problem / Why
User report (2026-10-09), before the next deploy:
- Choosing "Series" in the type select (`web/src/pages/Browse.tsx:144-148`) still lists studios without series in the studio select (`Browse.tsx:149-152`).
- The studio select offers "Películas" and "Series", which duplicate the type select. They are real catch-all studios (`kind = 'category'`, `api/database/studios/peliculas.php`, `series.php`) holding titles no real studio claims; with "Todos los estudios" + the type filter those titles stay reachable.
- With the "Sin ver" filter, marking a card as seen keeps it in the grid. Cause: S2 of `odd/tasks/catalog-stability.md` patches cached items in place after card actions (no reorder until next visit). That is right for sorts, but a card that no longer matches the active filter contradicts it.
- `/api/studios` (`api/src/Repository.php:58-77`) only returns `movieCount` (movies + series together), so the client cannot tell which types a studio has; `movies.media_type` holds it.

## Scope (authorized)
1. API: per-studio split by type: `filmCount` and `seriesCount` (`movieCount` stays the total for existing consumers).
2. Browse: hide the `peliculas` and `series` category studios from the studio select (keep "Anime", user decision 2026-10-09); list only studios with content of the selected type; reset the studio param when a type change makes it incompatible.
3. Card actions: when the active seen filter (e.g. "Sin ver") no longer matches a card after an action, remove only that card from the cached pages with a short fade-out, without refetching.

Out of scope: Ranking `ScopePicker`, Studios grid, Profile `StudioSelect`.

## Constraints
- UI copy stays Spanish as in the rest of the app; code, comments and docs in English.
- Keep the S2 stability contract: no refetch or reorder after card actions; only a non-matching card is removed.
- PHP must lint on php:7.4-cli and run on 8.2. Keep `/api/studios` backward compatible (existing fields stay).
- Prod is changed only by the user (deploy), after local verification.
- Planning heuristic ~400 authored changed lines per task (advisory only).

## TDD
Strict TDD mode is enabled in the global config, but the repo has no test runner (no test files; `web/package.json` scripts are `dev`, `build`, `preview`). No RED/GREEN evidence is possible; checks are `npm run build` (tsc + vite) in `web/`, `php -l` on touched PHP files, and a local API/UI check.

## Delivery
Forecast well under 400 authored changed lines: one slice, strategy `ask-on-risk`. Branch `feat/catalog-filters`, stacked on `fix/score-readout-class` (a92fb22, score readout class clash fix, reviewed and approved).

## Tasks
- [x] F1 — API: `filmCount` / `seriesCount` per studio in `Repository::studios()` and the `Studio` type (`web/src/lib/api.ts`). Route: delegated writer (writer trigger: 2+ non-trivial files with F2).
- [x] F2 — Browse dependent studio select: hide category studios `peliculas` and `series`; filter by selected type; clear an incompatible `studio` param on type change. Route: delegated writer.
- [x] F3 — Remove a card that stops matching the active seen filter after a card action (fade-out, no refetch). Route: delegated writer.

## Acceptance criteria
- Type "Series": the studio select lists only studios with `seriesCount > 0` (plus "Todos los estudios"); same for "Películas" with `filmCount > 0`; "Películas y series" lists all with any content.
- "Películas" and "Series" never appear in the studio select; "Anime" does when it has content of the selected type.
- Changing the type to one the selected studio lacks resets the studio to "Todos los estudios".
- With "Sin ver", marking a card seen fades it out and removes it; other cards keep their order and nothing refetches. Without a seen filter, cards stay as today.

## Progress
- Created 2026-10-09.
- F1 done in 4a74d0d (route: delegated writer). Naming: `movieCount` already means movies + series and Studios grid uses it as "títulos", so it stays the total; new `filmCount` (media_type movie) and `seriesCount` (media_type series) via conditional SUM. Checks: `php -l` 8.2 and php:7.4-cli OK; `npm run build` OK; `Repository::studios()` against local `mml` (mml-mariadb): 16 studios, film + series = total for all (e.g. anime 115/456, disney-xd 0/34, warner 147/0). HTTP `/api/studios` needs a session, not curled. TDD: no runner, no RED/GREEN.
- F2 done in 25d6763 (route: delegated writer). `Browse.tsx`: studio options = not (`kind = 'category'` and slug `peliculas`/`series`) and count of the selected type > 0 (`filmCount` / `seriesCount` / total). One rule, `compatible()`, drops a `studio` param the select does not offer: applied inside `set()` (so a type change resets it in the same `replace` update, no extra history) and in an effect for URLs loaded with such a studio (old `peliculas`/`series` links, or a type + studio pair without content), only once studios are loaded. Checks: `npm run build` OK. Expected with local data: "Películas" hides Disney XD; "Series" hides DreamWorks, Universal, Warner, Sony, Blue Sky, Ghibli; Anime stays in both. Browser check not run (needs a session).
- F3 done (route: delegated writer). `Browse.tsx` compares each loaded title's (patched) state with the `status` filter (`watched` -> watched, `unwatched` -> not watched, `pending` -> pending; no filter -> always matches); non-matching cards get `is-leaving` (opacity/scale 0.2s, no pointer events; the global reduced-motion rule shortens it) and after 200 ms (0 with reduced motion) `dropTitles()` (`lib/titleCache.ts`) removes only those ids from the active `['titles', filters]` cache and lowers `total`; pages keep their cursors, nothing refetches. Skipped while placeholder data is shown; the timer is cleared if the title matches again first. The modal stays hosted by TitleDetailProvider, so it survives the card leaving. Checks: `npm run build` OK. Browser check not run (needs a session).
- Engram mirror `odd/catalog-filters/tasks`: pending (host session registration failed on save); resync when available.
