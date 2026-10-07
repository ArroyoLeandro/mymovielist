export interface User { id: number; tag: string }
export interface Rating { tag: string; score: number | null }
/** Static title data (cacheable). */
export interface Movie {
  id: number
  title: string
  originalTitle: string | null
  year: number
  posterUrl: string | null
  mediaType: 'movie' | 'series'
  tmdbId: number | null
}
/** Dynamic per-title data; only titles with at least one entry have a row. */
export interface RatingRow {
  movieId: number
  watched: boolean
  score: number | null
  ratings: Rating[]
  watchersCount: number
  averageScore: number | null
}
export interface Section { slug: string; name: string; period: string; movies: Movie[] }
export interface Catalog { studio: { slug: string; name: string; logoUrl: string | null }; sections: Section[] }
export interface Studio { slug: string; name: string; logoUrl: string | null; movieCount: number }
export interface Progress { slug: string; watchedCount: number }
export interface Entry { movieId: number; watched: boolean; score: number | null; watchedAt: string | null }
/** Global ranking row. */
export interface GlobalRankingRow {
  tag: string
  watchedCount: number
  moviesWatched: number
  seriesWatched: number
  averageScore: number | null
  leaderOf: number
}
/** Per-studio ranking row (% of the studio's titles watched). */
export interface StudioRankingRow { tag: string; watchedCount: number; totalCount: number; percent: number; averageScore: number | null }
export type RankingRow = GlobalRankingRow & StudioRankingRow
interface HlMovie { id: number; title: string; year: number; posterUrl: string | null }
export interface Highlights {
  mostGenerous: { tag: string; average: number; count: number } | null
  mostDemanding: { tag: string; average: number; count: number } | null
  controversial: { movie: HlMovie; stdev: number; scores: { tag: string; score: number }[] } | null
  favorite: { movie: HlMovie; average: number; votes: number } | null
  soulmates: { a: string; b: string; common: number; match: number } | null
}
export interface ListEntry {
  movie: {
    id: number; title: string; originalTitle: string | null; year: number; posterUrl: string | null
    mediaType: 'movie' | 'tv'
    studio: { slug: string; name: string }
    section: { slug: string; name: string }
  }
  score: number | null
  watchedAt: string
}
export interface UserList {
  user: { tag: string }
  stats: {
    watchedCount: number
    totalMovies: number
    averageScore: number | null
    scoreDistribution: Record<string, number>
    byStudio: { slug: string; name: string; logoUrl: string | null; watched: number; total: number; avgScore: number | null }[]
  }
  entries: ListEntry[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

const errorText = (status: number) =>
  status === 401 ? 'Tu sesión expiró. Vuelve a entrar.' : status === 404 ? 'No se encontró lo que buscas.' : `No se pudo completar la solicitud (${status}).`

async function request<T>(method: string, path: string, body?: unknown, quiet401 = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !quiet401) onUnauthorized()
    throw new ApiError(res.status, errorText(res.status))
  }
  return data as T
}

export const api = {
  me: () => request<{ user: User }>('GET', '/session', undefined, true),
  login: (tag: string, password: string) => request<{ user: User }>('POST', '/session', { tag, password }, true),
  logout: () => request<void>('DELETE', '/session', undefined, true),
  studios: () => request<Studio[]>('GET', '/studios'),
  progress: () => request<Progress[]>('GET', '/me/progress'),
  catalog: (slug: string) => request<Catalog>('GET', `/studios/${encodeURIComponent(slug)}/movies`),
  ratings: (slug: string) => request<RatingRow[]>('GET', `/studios/${encodeURIComponent(slug)}/ratings`),
  saveEntry: (id: number, watched: boolean, score: number | null) =>
    request<Entry>('PUT', `/movies/${id}/entry`, { watched, score }),
  ranking: (studio?: string) => request<RankingRow[]>('GET', studio ? `/ranking?studio=${encodeURIComponent(studio)}` : '/ranking'),
  highlights: () => request<Highlights>('GET', '/highlights'),
  userList: (tag: string) => request<UserList>('GET', `/users/${encodeURIComponent(tag)}/list`),
}
