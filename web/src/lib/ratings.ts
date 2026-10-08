import type { RatingRow } from '../api'

export const blankRow = (movieId: number): RatingRow =>
  ({ movieId, watched: false, score: null, pending: false, ratings: [], watchersCount: 0, averageScore: null })

const byScore = (a: { tag: string; score: number | null }, b: { tag: string; score: number | null }) =>
  (b.score ?? -1) - (a.score ?? -1) || a.tag.localeCompare(b.tag)

/** Row after the user marks/unmarks a title or changes its score. Watching clears pending. */
export function patchEntry(row: RatingRow, tag: string, watched: boolean, score: number | null): RatingRow {
  const others = row.ratings.filter((r) => r.tag !== tag)
  const ratings = watched ? [...others, { tag, score }].sort(byScore) : others
  const scored = ratings.filter((r) => r.score !== null) as { score: number }[]
  return {
    ...row,
    watched,
    score: watched ? score : null,
    pending: watched ? false : row.pending,
    ratings,
    watchersCount: ratings.length,
    averageScore: scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 100) / 100 : null,
  }
}

/** Rows only exist for titles with ratings or a pending flag. */
export const isEmptyRow = (r: RatingRow) => r.ratings.length === 0 && !r.pending

export function upsertRow(rows: RatingRow[], row: RatingRow): RatingRow[] {
  const rest = rows.filter((r) => r.movieId !== row.movieId)
  return isEmptyRow(row) ? rest : [...rest, row]
}
