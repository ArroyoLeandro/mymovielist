import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api, type TitleFilters } from './api'

const HOUR = 60 * 60 * 1000

// Static data: titles, posters, studios. The server answers revalidations with 304.
export const useStudios = () =>
  useQuery({ queryKey: ['studios'], queryFn: api.studios, staleTime: HOUR, gcTime: 24 * HOUR })

export const useCatalog = (slug: string) =>
  useQuery({ queryKey: ['catalog', slug], queryFn: () => api.catalog(slug), staleTime: HOUR, gcTime: 24 * HOUR })

// Where-to-watch providers (static until the weekly refresh): the global logo/name dictionary.
export const useProviders = () =>
  useQuery({ queryKey: ['providers'], queryFn: api.providers, staleTime: 6 * HOUR, gcTime: 24 * HOUR })

// Dynamic data.
export const useProgress = () => useQuery({ queryKey: ['progress'], queryFn: api.progress })

export const useRanking = (studio?: string) =>
  useQuery({ queryKey: ['ranking', studio ?? 'global'], queryFn: () => api.ranking(studio), refetchInterval: 15000, refetchIntervalInBackground: false })

export const useHighlights = () =>
  useQuery({ queryKey: ['highlights'], queryFn: api.highlights, refetchInterval: 30000, refetchIntervalInBackground: false })

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: api.users, staleTime: 5 * 60 * 1000 })

// Global pages are dynamic but their lists stay put while they are on screen: refetched on mount (every visit), never
// on a timer or on window focus (a refetch would reorder or drop cards under the user). Card actions patch the
// cached titles in place instead (lib/titleCache.ts).
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: api.home, refetchOnWindowFocus: false })

export const useProfile = (tag: string) =>
  useQuery({ queryKey: ['profile', tag], queryFn: () => api.profile(tag), refetchOnWindowFocus: false })

/**
 * /catalogo grid, 60 titles per page (keyset cursor). Kept 30 min so back navigation finds every loaded page (the
 * scroll position can be restored); fresh for 1 min, so coming straight back does not refetch and reshuffle it.
 * Never refetched on focus or reconnect: that refetches every loaded page and can reorder what is on screen.
 * While a new filter loads, the previous grid stays (dimmed) instead of collapsing to a skeleton.
 */
export const useTitlesList = (filters: TitleFilters) =>
  useInfiniteQuery({
    queryKey: ['titles', filters],
    queryFn: ({ pageParam }) => api.titles(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : null),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

// Other versions of a title: static matching plus the viewer's state, patched in place after an action like the lists.
export const useVersions = (id: number) =>
  useQuery({ queryKey: ['versions', id], queryFn: () => api.versions(id), staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false })

// Trailers (TMDB, cached by the server for days): fetched when a title modal opens and kept for the session. A TMDB
// failure comes back as an empty `unavailable` answer: stale at once, so the next open of that title asks again.
export const useTrailers = (id: number) =>
  useQuery({
    queryKey: ['trailers', id],
    queryFn: () => api.trailers(id),
    staleTime: (q) => (q.state.data?.unavailable ? 0 : Infinity),
    gcTime: 24 * HOUR,
    refetchOnWindowFocus: false,
    retry: false,
  })

export const useSearch = (q: string) =>
  useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length >= 2, staleTime: 15000, placeholderData: (prev) => prev })

// TMDB search for titles missing from the catalog: results change slowly, but inCatalog flips after an import
// (the add hook invalidates ['tmdb']). No retry: a 429 must not be repeated.
export const useTmdbSearch = (q: string, enabled = true) =>
  useQuery({ queryKey: ['tmdb', q], queryFn: () => api.tmdbSearch(q), enabled: enabled && q.length >= 2, staleTime: 10 * 60 * 1000, retry: false })

/** Queries listing titles with per-user state: patched in place after an action, refetched on the next visit. */
export const LIST_KEYS = ['home', 'titles', 'search', 'versions', 'profile', 'ratings'] as const
/** Counters and rankings (no title cards): refetched right away after an action. */
export const STAT_KEYS = ['progress', 'highlights', 'ranking'] as const
