# Feature: Catalog stability, duplicate cleanup, versions and trailers

## Objective
Remove the "the same titles keep repeating" feeling: fix the real data problems, stop lists from reordering/repeating while people use them, make remakes read as different versions, and add a trailer link to every title.

## Problem / Why
User report (2026-10-08): the site feels full of repeated movies/series. Audit on a fresh prod copy (2965 titles, 3030 watch entries) found the DB has no same-TMDB duplicates (`UNIQUE(media_type, tmdb_id)`), but:
- Data: Mad Max saga named "Hombres de negro" (`api/database/studios/saga-names.php:12`); Waverly Place saga split in two (`franchises.php:30` lacks collection 413935); pilot TV movies duplicating their series (#901 Batman Beyond movie vs #1155 series, #649 Star Wars Rebels: Spark of Rebellion vs #125 series; `lucasfilm.php:20` lacks `without_genres` 10770); a The Asylum mockbuster "The Odyssey" (#3330, tmdb 1698863) next to Nolan's (#3331, tmdb 1368337), both on one user's watchlist.
- Frontend: `/catalogo` offset pagination over sorts that change with every friend's mark (`Repository.php:931-935`, `Browse.tsx:75-93`, no client dedup) repeats/skips titles across pages (SQL repro); every card action invalidates all dynamic queries (`LiveCard.tsx:17-19`) refetching every loaded page and reordering; home rows overlap with no cross-row dedup (`Repository.php:942-979`); `useDialog` restores focus without `preventScroll` (`useDialog.ts:21`); the modal is local card state and unmounts when the card leaves a filtered list; filter changes swap to skeletons without scrolling to the results top.
- Remakes share the same Spanish title (68 groups) and users track versions separately (do NOT merge them).

## Scope (authorized, in this order)
1. Data fixes (sagas, mockbusters, pilot TV movies) with a reusable, safe title merge tool.
2. Ordering/scroll stability (pagination, in-place cache updates, home dedup, modal focus/state, filter scroll).
3. Versions UI: "Animada / Acción real / Serie" label on cards and "Otras versiones" in the title modal.
4. Trailer link per title (TMDB videos, on demand, cached).

## Constraints
- Artifacts (code, UI copy is Spanish as in the rest of the app, comments, docs) follow existing conventions; code/comments/docs in English.
- Never lose user data: merges re-point watch entries, watchlist and recommendations; everything tested on the local prod copy first.
- Prod is changed only by the user (deploy + migrations/scripts), after local verification.
- PHP must lint on php:7.4-cli (as in previous tasks) and run on 8.2.
- Planning heuristic ~400 authored changed lines per task (advisory only).

## Tasks
- [x] S1 — Data fixes: saga name Mad Max; Waverly Place collection 413935 in the franchise; exclude The Asylum (and verified TMDB company id) from discover sources; lucasfilm animated films exclude TV Movie genre 10770; exclude the Batman Beyond movie pilot; `bin/merge-titles.php --from --to [--dry-run]` (watch entries: keep highest score, earliest watched_at; union watchlist/recommendations keeping dismissed state; delete the merged row and its providers; one transaction); apply locally 3330->3331, 901->1155, 649->125; scan the catalog for other mockbusters/pilots. Route: delegated writer (writer trigger: 2+ non-trivial files).
- [ ] S2 — Stability: keyset (cursor) pagination for `/api/titles` + client dedup by id; after card actions patch cached items in place (no reorder until next visit); home cross-row dedup; `focus({preventScroll:true})`; modal survives the card leaving the list; scroll to results top on filter change; longer `titles` gcTime. Route: delegated writer.
- [ ] S3 — Versions: card type label; "Otras versiones" in the modal (same normalized original title, computed at read time). Route: delegated writer.
- [ ] S4 — Trailers (user decision 2026-10-08: the group watches original audio): API endpoint returning up to two YouTube trailers, cached: (a) always the original-language trailer (TMDB `original_language`; fallback English when none, labeled as such), (b) plus a Latin-American Spanish trailer only when one exists (region MX/AR/419 etc.; a Spain-only Spanish trailer does not count). Modal UI (user decision 2026-10-08): one link per trailer with the YouTube logo (inline SVG), labels "Tráiler" (original language) and "Tráiler latino"; the English fallback, when the original language is not English, reads "Tráiler (inglés)". Links open YouTube in a new tab (`target="_blank" rel="noopener noreferrer"`). Route: delegated writer.

## Acceptance criteria
- No saga named twice for different franchises; Waverly Place is one saga.
- #3330, #901, #649 gone locally with their user data moved to the kept rows; a re-run of the importer (dry run) does not bring them back.
- Scrolling `/catalogo` on any sort never shows a title twice; marking/scoring/watchlisting never reorders or removes cards on screen; closing the modal never jumps the page.
- A title appears at most once on the home page.
- Remakes show their type and link to their other versions.
- Every title modal offers the original-language trailer when TMDB has one, plus the Latin-American Spanish one when it exists.

## Checks
- TDD: OFF (source: user, carried over from `odd/tasks/disney-catalog.md`). No test runner.
- `php -l` (7.4 and 8.2) on changed PHP; `npm run build` (tsc -b + vite) in `web/`; curl/SQL smoke tests against the local stack (container `mml-mariadb`, db `mml` = prod copy of 2026-10-08 12:36; pre-deploy copy in `mml_old`); importer `--dry-run` after data fixes; headless Chrome where layout matters.

## Delivery
- Branch `feat/catalog-stability` from `main` (d3c9130). One work-unit commit per task (Conventional Commits). Push/PR/deploy are the user's decision. Strategy: ask-on-risk (chain strategy asked before any PR).
- RDD: on (default). Assessment per work-unit commit.

## Progress
- Branch created. Local DB refreshed from prod (backup `backups/local-before-prod-refresh-20261008.sql`). Prod deploy of phase 3 verified (no user data lost vs `backups/prod-20261008-004648-pre-T25.sql`).

- S1 done (route: delegated writer; commit 0cc8749). Global `api/database/studios/exclusions.php` (The Asylum TMDB 1311 + affiliates 152189, 282681; title movie:64202) applied to every discover call (`without_companies`) and to title details; lucasfilm animated films exclude 10770 (TMDB tags #649 as TV Movie); Mad Max saga name; Waverly Place collection 413935 joined to the franchise; `api/bin/merge-titles.php` (one transaction, dry run, refuses equal/missing/cross-media without flag); migration 009 (guards by id + media/tmdb, idempotent, final check SELECT `0 1 0 1`). Local (backup `backups/local-before-S1.sql`): php 7.4 lint 43 files OK; 009 run twice OK; titles 2965 -> 2962; watch entries 3030 -> 3027 (3 merged conflicts: user 4 649->125 score 7+8 -> 8, users 4/5 901->1155 earliest date kept); watchlist 43 -> 42 (user 5 had both Odysseys); recommendations 2; collections Hombres de negro 1, Mad Max 1, Waverly 1 saga with 4 titles; importer `--studio=all --prune --dry-run` does not re-add 1698863/64202/287663. Parent spot check: rows gone, saga counts and 3027 watch entries confirmed. Scan: no other mockbusters; Battlestar Galactica miniseries #2309 vs series #2245 kept (separate TMDB shows); Clone Wars film and Return of the Joker are real films, kept.
- Gap found: manual import (`POST /api/titles/import`) does not check `exclusions.php`; folded into S2 brief.
- Prod runbook (S1): back up, upload `api/`, then run 009 in phpMyAdmin (code first, or the old importer re-adds the duplicates).

## Next step
S2 (delegated writer).
