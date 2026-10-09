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
  /** TMDB genre Animation; null until the importer has seen the title. */
  animated?: boolean | null
  tmdbId: number | null
  collection: { slug: string; name: string } | null
  providers: ProviderRef[]
  providersLink: string | null
  /** Tag of the friend who added it by hand (search "¿No está? Agrégalo"); null for imported titles. */
  addedBy?: string | null
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
/** A YouTube trailer (watch URL: https://www.youtube.com/watch?v=<key>). */
export interface Trailer { key: string; name: string }
/**
 * TMDB extras of the title modal. Trailers: in its original language (or English, flagged `fallback`, when there is none
 * and the original language is not English) and a Latin-American Spanish dub. Synopsis: Latin-American Spanish, else
 * Spain's, else English (`overviewLang`); null when TMDB has none. `unavailable`: TMDB failed; try again on a later open.
 */
export interface TitleExtras {
  original: (Trailer & { lang: string; fallback: boolean }) | null
  latino: Trailer | null
  overview: string | null
  overviewLang: 'es-MX' | 'es-ES' | 'en' | null
  unavailable?: boolean
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
export interface Studio {
  slug: string
  name: string
  logoUrl: string | null
  kind?: 'studio' | 'category'
  /** Total titles (movies + series). */
  movieCount: number
  /** Movies only (`media_type = 'movie'`). */
  filmCount: number
  /** Series only (`media_type = 'series'`). */
  seriesCount: number
}
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
  /** TMDB genre Animation; null until the importer has seen the title. */
  animated?: boolean | null
  tmdbId: number | null
  studio: { slug: string; name: string; kind: 'studio' | 'category' }
  section: { slug: string; name: string }
  providers: ProviderRef[]
  providersLink: string | null
  addedBy?: string | null
}
/** Title plus the viewer's dynamic state (watched, score, pending, group ratings). */
export interface StateTitle extends TitleSummary { state: RatingRow }
export interface HomeSaga { slug: string; name: string; posterUrl: string | null; total: number; seen: number; studioSlug: string }
export type HomeRow =
  | { key: string; title: string; link: string | null; kind: 'titles'; items: StateTitle[] }
  | { key: string; title: string; link: string | null; kind: 'sagas'; items: HomeSaga[] }
/** One page of GET /api/titles; `nextCursor` (keyset, opaque) asks for the page after it, null on the last page. */
export interface TitlesPage { items: StateTitle[]; total: number; hasMore: boolean; nextCursor: string | null }
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

/** TMDB search result for titles missing from the catalog. */
export interface TmdbResult {
  tmdbId: number
  mediaType: 'movie' | 'series'
  title: string
  originalTitle: string | null
  year: number | null
  posterUrl: string | null
  voteCount: number
  released: boolean
  inCatalog: { id: number; studioSlug: string } | null
  /** Listed in the catalog exclusions (pilots, mockbusters): it cannot be added. */
  excluded?: boolean
}
export interface ImportResult { created: boolean; title: StateTitle; studio: { slug: string; name: string; kind: 'studio' | 'category' } }

// ---- admin: catalog sync run step by step ----
export type SyncMode = 'full' | 'import' | 'providers'
export type StepStatus = 'pending' | 'partial' | 'done' | 'error'
export interface SyncStep {
  kind: 'import' | 'prune' | 'providers'
  studio: string | null
  label: string
  status: StepStatus
  summary: Record<string, number | string[]> | null
  error: string | null
  durationMs: number
  calls: number
  progress: { done: number; total: number } | null
}
export interface SyncTotals {
  new: number; updated: number; deleted: number; providersUpdated: number; withProviders: number; failedSteps: number; unfinishedSteps: number
}
export interface SyncRun {
  id: string
  mode: SyncMode
  by: string
  startedAt: string
  finishedAt: string | null
  options: { limit: number; staleDays: number }
  steps: SyncStep[]
  totals: SyncTotals | null
  cancelled: boolean
  abandoned?: boolean
}
export interface StepResult extends SyncStep { index: number; log: string[] }
export type AdminStatus =
  | { unlocked: false }
  | { unlocked: true; expiresIn: number; steps: Record<SyncMode, number>; running: SyncRun | null; lockExpiresIn: number | null; lastRun: SyncRun | null }

export class ApiError extends Error {
  status: number
  /** Machine-readable reason sent by the server (e.g. 'rate_limited', 'unreleased'). */
  code: string | null
  data: Record<string, unknown>
  constructor(status: number, message: string, code: string | null = null, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
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
    const d = data as Record<string, unknown>
    throw new ApiError(res.status, errorText(res.status), typeof d.code === 'string' ? d.code : null, d)
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
  titles: (f: TitleFilters, cursor: string | null) => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v))
    if (cursor) p.set('cursor', cursor)
    return request<TitlesPage>('GET', `/titles?${p}`)
  },
  providers: () => request<ProviderStat[]>('GET', '/providers?used=1'),
  search: (q: string) => request<StateTitle[]>('GET', `/search?q=${encodeURIComponent(q)}`),
  /** Other versions of a title (remakes, the series and the movie...), oldest first. */
  versions: (id: number) => request<StateTitle[]>('GET', `/titles/${id}/versions`),
  /** Trailers and synopsis from TMDB (fetched on demand by the server). */
  extras: (id: number) => request<TitleExtras>('GET', `/titles/${id}/extras`),
  setPending: (id: number, pending: boolean) => request<void>(pending ? 'PUT' : 'DELETE', `/movies/${id}/watchlist`),
  recommend: (id: number, toTags: string[], note: string) =>
    request<{ sentTo: string[] }>('POST', `/movies/${id}/recommendations`, { toTags, note: note.trim() || null }),
  deleteRecommendation: (id: number) => request<void>('DELETE', `/recommendations/${id}`),
  /** Recipient only: hide a received recommendation (true) or undo that (false). */
  dismissRecommendation: (id: number, dismissed: boolean) =>
    request<void>(dismissed ? 'POST' : 'DELETE', `/recommendations/${id}/dismiss`),
  tmdbSearch: (q: string) => request<{ query: string; results: TmdbResult[] }>('GET', `/tmdb/search?q=${encodeURIComponent(q)}`),
  importTitle: (tmdbId: number, mediaType: 'movie' | 'series') => request<ImportResult>('POST', '/titles/import', { tmdbId, mediaType }),
  admin: {
    status: () => request<AdminStatus>('GET', '/admin/status'),
    // quiet401: a wrong admin password must not end the site session.
    unlock: (password: string) => request<{ unlocked: true; expiresIn: number }>('POST', '/admin/unlock', { password }, true),
    start: (mode: SyncMode, options: { limit?: number; staleDays?: number } = {}) => request<SyncRun>('POST', '/admin/sync/start', { mode, ...options }),
    step: (runId: string, index: number) => request<StepResult>('POST', '/admin/sync/step', { runId, index }),
    finish: (runId: string, cancelled = false) => request<SyncRun>('POST', '/admin/sync/finish', { runId, cancelled }),
  },
}
