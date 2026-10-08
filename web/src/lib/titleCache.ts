import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { HomeRow, Profile, RatingRow, StateTitle, TitlesPage } from '../api'
import { LIST_KEYS, STAT_KEYS } from '../queries'
import { blankRow, upsertRow } from './ratings'

/** New per-user state of one title, computed from its cached state (e.g. patchEntry after a save). */
export type StatePatch = (row: RatingRow) => RatingRow

const patchItems = (items: StateTitle[], id: number, fn: StatePatch): StateTitle[] => {
  if (!items.some((t) => t.id === id)) return items
  return items.map((t) => (t.id === id ? { ...t, state: fn(t.state) } : t))
}

/**
 * After a card action (watched, score, wishlist): updates that title's state in every cached list that holds it,
 * in place. Order and membership do not change (a watched title stays in "Sin ver" until the next visit), so nothing
 * moves under the user. Lists are refetched on their next mount, see settleAfterAction().
 * @param studioSlug also patch that studio page's ratings cache
 */
export function patchTitle(qc: QueryClient, id: number, fn: StatePatch, studioSlug?: string) {
  qc.setQueriesData<InfiniteData<TitlesPage>>({ queryKey: ['titles'] }, (d) => {
    if (!d) return d
    let changed = false
    const pages = d.pages.map((p) => {
      const items = patchItems(p.items, id, fn)
      if (items !== p.items) changed = true
      return items === p.items ? p : { ...p, items }
    })
    return changed ? { ...d, pages } : d
  })
  qc.setQueriesData<{ rows: HomeRow[] }>({ queryKey: ['home'] }, (d) => {
    if (!d) return d
    const rows = d.rows.map((r) => {
      if (r.kind !== 'titles') return r
      const items = patchItems(r.items, id, fn)
      return items === r.items ? r : { ...r, items }
    })
    return rows.some((r, i) => r !== d.rows[i]) ? { rows } : d
  })
  qc.setQueriesData<StateTitle[]>({ queryKey: ['search'] }, (d) => d && patchItems(d, id, fn))
  qc.setQueriesData<StateTitle[]>({ queryKey: ['versions'] }, (d) => d && patchItems(d, id, fn))
  if (studioSlug) {
    qc.setQueriesData<RatingRow[]>({ queryKey: ['ratings', studioSlug] }, (rows) =>
      rows && upsertRow(rows, fn(rows.find((r) => r.movieId === id) ?? blankRow(id))))
  }
  // Own profile, "Recomendadas": the watched / pending flags of that title.
  qc.setQueriesData<Profile>({ queryKey: ['profile'] }, (p) => {
    if (!p?.recommendedToMe?.some((r) => r.movie.id === id)) return p
    return {
      ...p,
      recommendedToMe: p.recommendedToMe.map((r) => {
        if (r.movie.id !== id) return r
        const row = fn({ ...blankRow(id), watched: r.watched, pending: r.pending })
        return { ...r, watched: row.watched, pending: row.pending }
      }),
    }
  })
}

/**
 * Marks the title lists stale without refetching them now (they refetch on their next mount, i.e. the next visit),
 * and refreshes counters and rankings right away.
 */
export function settleAfterAction(qc: QueryClient) {
  for (const k of LIST_KEYS) void qc.invalidateQueries({ queryKey: [k], refetchType: 'none' })
  for (const k of STAT_KEYS) void qc.invalidateQueries({ queryKey: [k] })
}
