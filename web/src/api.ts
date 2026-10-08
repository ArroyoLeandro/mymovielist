export interface User { id: number; tag: string }
/** Where to watch (Argentina): one entry per provider and offer type, sorted by type then TMDB priority. */
export type ProviderType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy'
export interface ProviderRef { id: number; type: ProviderType }
export interface ProviderInfo { name: string; logoUrl: string | null }
export interface ProviderStat extends ProviderInfo { id: number; titleCount: number; flatrateCount: number }
/** Where-to-watch fields carried by every title payload. */
export interface Availability { providers: ProviderRef[]; providersLink: string | null }
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
  collection: { slug: string; name: string } | null
  providers: ProviderRef[]
  providersLink: string | null
}
/** Dynamic per-title data; only titles with at least one entry have a row. */
export interface RatingRow {
  movieId: number
  watched: boolean
  score: number | null
  pending: boolean
  ratings: Rating[]
  watchersCount: number
  averageScore: number | null
}
export interface Section { slug: string; name: string; period: string; movies: Movie[] }
/** Collection with 2+ titles in the studio; titleIds are in release order. */
export interface Saga { slug: string; name: string; posterUrl: string | null; titleIds: number[] }
export interface Catalog {
  studio: { slug: string; name: string; logoUrl: string | null }
  sections: Section[]
  sagas: Saga[]
  /** Providers used by this studio's titles, keyed by id. */
  providers: Record<string, ProviderInfo>
}
export interface Studio { slug: string; name: string; logoUrl: string | null; kind?: 'studio' | 'category'; movieCount: number }
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
/** Title as returned by the global endpoints (home, titles, search, profile). */
export interface TitleSummary {
  id: number
  title: string
  originalTitle: string | null
  year: number
  posterUrl: string | null
  mediaType: 'movie' | 'series'
  tmdbId: number | null
  studio: { slug: string; name: string; kind: 'studio' | 'category' }
  section: { slug: string; name: string }
  providers: ProviderRef[]
  providersLink: string | null
}
/** Title plus the viewer's dynamic state (watched, score, pending, group ratings). */
export interface StateTitle extends TitleSummary { state: RatingRow }
export interface HomeSaga { slug: string; name: string; posterUrl: string | null; total: number; seen: number; studioSlug: string }
export type HomeRow =
  | { key: string; title: string; link: string | null; kind: 'titles'; items: StateTitle[] }
  | { key: string; title: string; link: string | null; kind: 'sagas'; items: HomeSaga[] }
export interface TitlesPage { items: StateTitle[]; total: number; page: number; hasMore: boolean }
export interface TitleFilters {
  type?: string; studio?: string; decade?: string; status?: string; sort?: string; q?: string
  /** Comma-separated provider ids. */
  provider?: string
  /** flatrate (also free/ads) | rent | buy | any */
  ptype?: string
}

export interface ListEntry {
  movie: TitleSummary
  score: number | null
  watchedAt: string
}
export interface Recommended { id: number; movie: TitleSummary; from: string; note: string | null; createdAt: string; watched: boolean; pending: boolean }
/** `dismissed`: the recipient removed it from their list (the sender keeps it). */
export interface MyRecommendation { id: number; movie: TitleSummary; note: string | null; createdAt: string; watched: boolean; score: number | null; dismissed: boolean }
export interface Profile {
  user: { tag: string }
  stats: {
    watchedCount: number
    totalMovies: number
    averageScore: number | null
    scoreDistribution: Record<string, number>
    byStudio: { slug: string; name: string; logoUrl: string | null; watched: number; total: number; avgScore: number | null }[]
  }
  watched: ListEntry[]
  pending: (TitleSummary & { addedAt: string })[]
  /** Only present on the logged-in user's own profile. */
  recommendedToMe?: Recommended[]
  myRecommendations?: { toTag: string; items: MyRecommendation[] }[]
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
  profile: (tag: string) => request<Profile>('GET', `/users/${encodeURIComponent(tag)}/profile`),
  users: () => request<string[]>('GET', '/users'),
  home: () => request<{ rows: HomeRow[] }>('GET', '/home'),
  titles: (f: TitleFilters, page: number) => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v))
    p.set('page', String(page))
    return request<TitlesPage>('GET', `/titles?${p}`)
  },
  providers: () => request<ProviderStat[]>('GET', '/providers?used=1'),
  search: (q: string) => request<StateTitle[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  setPending: (id: number, pending: boolean) => request<void>(pending ? 'PUT' : 'DELETE', `/movies/${id}/watchlist`),
  recommend: (id: number, toTags: string[], note: string) =>
    request<{ sentTo: string[] }>('POST', `/movies/${id}/recommendations`, { toTags, note: note.trim() || null }),
  deleteRecommendation: (id: number) => request<void>('DELETE', `/recommendations/${id}`),
  /** Recipient only: hide a received recommendation (true) or undo that (false). */
  dismissRecommendation: (id: number, dismissed: boolean) =>
    request<void>(dismissed ? 'POST' : 'DELETE', `/recommendations/${id}/dismiss`),
}
