# Profile redesign

## Objective

Rework the profile page (`/u/:tag`, own and other users) so it reads clearly at a glance, and fix the broken score distribution chart.

## Problem

- Score chart (`.dist` in `web/src/pages/Profile.tsx`): bars are sized as a percentage of a column with no definite height, so the tallest bar plus its label overflows the panel top; no counts are shown; the gold-to-rose gradient is stretched per bar, so short bars look pink and tall ones lime (color encodes nothing).
- Studio progress (16 bars in 4 columns) truncates names ("Cartoon Net...", "Disney Live A...") and is repeated right below as a wall of studio filter chips in "Vistas".
- Header is the tag plus a generic sentence; the `Avatar` component used elsewhere is not shown.
- "Vistas" groups use a mini studio logo that renders truncated text for categories without a logo ("Pelícu...").
- Every row is a full bordered card: 667 rows read as a stack of boxes.

## Scope

- In: `web/src/pages/Profile.tsx`, a new `web/src/components/ScoreChart.tsx`, profile styles in `web/src/index.css`, `ProfileSkeleton` in `web/src/components/Skeleton.tsx`.
- Out: API/payload changes, other pages, the title modal, new dependencies.

## Constraints

- Keep the app's design system (dark only; tokens in `web/src/index.css`: `--gold`, `--rose`, `--panel`, `--line`, `--display` Bricolage Grotesque, `--body` Figtree). UI copy in Spanish (existing product language), code/comments in English.
- No navigation to the catalog from the profile (fix d1eeed3 stays: rows open the title modal).
- Chart rules (dataviz skill): single series, no legend; bars anchored to the baseline with a definite plot height, 4px rounded tops, 2px gap; one solid hue (no per-bar gradient); selective direct labels; per-bar hover/focus tooltip with a hit target taller than the mark; an accessible table equivalent; text in text tokens, not the series color.
- Responsive down to 320px, no horizontal scroll; visible keyboard focus; `prefers-reduced-motion` respected.
- TDD: off (user decision, recorded in the catalog-stability session); no web test runner exists. Checks: `npm run build` in `web/`, headless Chrome screenshots at 320/360/390/1280 against the local stack.
- About 400 authored changed lines per task is a planning heuristic only.

## Design plan

- Header: avatar + tag (display type) and one plain line of what the page holds.
- Overview panel: watched count with progress toward the catalog total and the average score on the left; `ScoreChart` on the right (counts, the most common score labeled, the average marked on the axis).
- Studio progress doubles as the "Vistas" studio filter: full names, watched/total and percent, top studios first with a "Ver todos" toggle; selecting one filters "Vistas" (switching to that tab). The chip wall goes away.
- Lists: card grids (catalog card look): poster-first cards in the catalog grid (`.grid`, same column sizing as /catalogo), type badge and the user's score pill on the poster, title and year below; tab actions and state tags pinned to the card bottom so rows line up. "Vistas" keeps the studio groups (header + grid); group header without the broken mini logo for categories. User decision on 2026-10-08 (replaced the earlier "divided rows" plan).

## Tasks

- [x] P1 ScoreChart: new component replacing `.dist` in the profile; fixes overflow, adds counts/tooltip/average/a11y table. Route: delegated writer (2+ non-trivial files).
- [x] P2 Overview: header with avatar, overview panel, studio progress as the "Vistas" filter (chips removed). Route: delegated writer.
- [x] P3 Lists and skeleton: card grids (catalog card look; user decision 2026-10-08, replaced "divided rows"), group header fix, `ProfileSkeleton` matches the new layout; phone and desktop screenshots. Route: delegated writer.

## Acceptance criteria

- No bar or label leaves the chart panel at any data shape (all zeros, one bucket, 600+ in one bucket) and any width.
- Every studio name is readable in full (wrap, not ellipsis) at 1280 and 360.
- Studio filtering still works and shows counts; sort and type filters unchanged.
- Own profile actions (La vi, Quitar, Quiero verla, dismiss/undo, Eliminar) behave as before.
- Build passes; screenshots at 320/360/390/1280 show no overflow.

## Delivery

- Branch `feat/profile-redesign` from `main` (d1eeed3). One work-unit commit per task. Forecast ~600 authored lines. Push and production deploy are the user's decision.

## Progress

- 2026-10-08: document created after the profile modal fix (d1eeed3, deployed).
- 2026-10-08: P1 done in 155be34 (delegated writer). `ScoreChart` replaces `.dist`: plot of definite height (120px, 100px on phones) with label headroom, single-hue bars (top score full `--gold`, others a dimmer mix of the same hue), count label on the top bucket only, full-height focusable columns with tooltip, average caret on the axis, empty-state message. Accessibility decision: each column is a focusable `role="img"` named "Puntaje N: X títulos", which serves as the table equivalent; a separate visually-hidden table was not added because it would either be read twice or require focusable content inside `aria-hidden`. Evidence: `npm run build` passes; headless Chrome against the local stack (Kanji1 637 vistas, rezak 4, Alonso 0) at 320/360/1280: no horizontal overflow, no chart element outside its panel (bounding-box check), tooltip visible on focus at both edges.
- 2026-10-08: P2 done in 97f5891 (delegated writer). Header with `Avatar` (64px, 52px on phones) and the existing lead copy; one overview panel (watched/total with a solid gold meter and percent of the catalog, average score; `ScoreChart` on the right, stacked under 720px); "Progreso por estudio" rows with full wrapped names, watched/total and percent, top 6 plus "Ver todos (N)" / "Ver menos" (a picked studio from the tail stays visible when collapsed). Rows are `aria-pressed` toggles that set the studio filter and switch to "Vistas" (scrolling the tabs into view when they are below the fold); "Todos" in the panel header and a "Filtrando: <estudio> ×" chip in "Vistas" clear it. Chip wall removed; dead `.stats`/`.stat`/`.studio-bars`/`.sbar` CSS removed; `ProfileSkeleton` header and overview updated. Evidence: `npm run build` passes; screenshots (Kanji1, rezak) at 320/390/1280: no horizontal overflow, no chart element outside the overview panel; picking "Anime" from `?tab=pendientes` switched to "Vistas" with the pressed row and the filter chip.
- 2026-10-08: P3 done in 312ea0a (delegated writer). Scope change from the user mid-task: card grids in the catalog look instead of divided rows. `ProfileCard` (in `Profile.tsx`) reuses the catalog card classes (`.card`, `.art`, `.badge`, `.my-score`, `.title-open`, `.year`, `ProviderStrip`) without `TitleCard`'s per-user state; poster and title open the title modal (`useOpenTitle`), no links to /studio. Vistas: score pill on the poster ("★ 8" or "Sin puntaje"), grouped grids (or one grid when a studio is picked), `.era-body` for off-screen rendering. Pendientes: "Agregada el …" + La vi / Quitar. Recomendadas: "de @…" + notes clamped to 3 lines + Quiero verla / La vi / dismiss, undo toast unchanged. Mis recomendaciones: per recipient, status tags + Eliminar. `.is-done` dims poster, title, year and providers. Group header shows the mini logo only when the studio has a logo URL. `ProfileSkeleton` ends with tabs + a card grid. Dead CSS removed (`.list`, row classes, `.score-pill`, `.tags`, `.sk-row`, `.sk-stat`). Evidence: `npm run build` passes; screenshots at 320/360/390/1280 (Kanji1 637 vistas, rezak 4), Pendientes/Recomendadas (Kanji1) and Mis recomendaciones (nehuen) at 320/1280, Juli viewed by Kanji1 with "Ver todos" expanded at 360/1280: `scrollWidth == innerWidth` everywhere, no chart element outside its panel, card rows aligned, focus ring visible on a card title, all 15-16 studio names in full. Not observed: the skeleton itself (loads too fast locally; it reuses the catalog `SkGrid`).

- 2026-10-08: Review of the slice d1eeed3..e2a4a1f (512 lines, medium, `slice_budget_reached`): user granted consent; one reliability lens; approved and acknowledged (authority burned). Advisory only: provider guard (checked: `ProviderStrip` already handles `undefined`, no change), tied maxima label several bars (follow-up, cosmetic), no automated checks for chart/percent helpers (no web test runner). Parent spot check: `npm run build` re-run passes; 1280/360/320 screenshots viewed.

- 2026-10-08: Delivered (user authorized). `main` fast-forwarded to the branch and pushed. Prod: frontend only (no `api/` changes); bundle index-DAf3BW-x.js / index-CA4hmEi9.css uploaded over TUS, then index.html; previous bundle (index-DTLWaiUI.js / index-CMMRH6hN.css) deleted. Check: site serves the new bundle names, JS contains "Progreso por estudio", CSS 200. Note: `deploy/build.sh` (`npm ci`) failed with EPERM until a leftover local vite dev server holding the rolldown binding was stopped.

## Next step

- Follow-up: single direct label on tied maxima. User feedback on phones.
