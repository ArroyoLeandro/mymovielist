export interface User { id: number; tag: string }
export interface Rating { tag: string; score: number | null }
export interface Movie {
  id: number
  title: string
  originalTitle: string | null
  year: number
  posterUrl: string | null
  watched: boolean
  score: number | null
  watchersCount: number
  averageScore: number | null
  ratings: Rating[]
}
export interface Section { slug: string; name: string; period: string; movies: Movie[] }
export interface Catalog { studio: { slug: string; name: string }; sections: Section[] }
export interface Entry { movieId: number; watched: boolean; score: number | null; watchedAt: string | null }
export interface RankingRow { tag: string; watchedCount: number; averageScore: number | null }
export interface ListEntry {
  movie: { id: number; title: string; originalTitle: string | null; year: number; posterUrl: string | null }
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
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: User }>('GET', '/session', undefined, true),
  login: (tag: string, password: string) => request<{ user: User }>('POST', '/session', { tag, password }, true),
  logout: () => request<void>('DELETE', '/session', undefined, true),
  catalog: (slug: string) => request<Catalog>('GET', `/studios/${encodeURIComponent(slug)}/movies`),
  saveEntry: (id: number, watched: boolean, score: number | null) =>
    request<Entry>('PUT', `/movies/${id}/entry`, { watched, score }),
  ranking: () => request<RankingRow[]>('GET', '/ranking'),
  userList: (tag: string) => request<UserList>('GET', `/users/${encodeURIComponent(tag)}/list`),
}
