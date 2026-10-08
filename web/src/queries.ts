import { useQuery } from '@tanstack/react-query'
import { api } from './api'

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

// Global pages are dynamic: refetched on mount/focus and after every mutation, never on a timer (a poll arriving
// mid-edit would overwrite an optimistic change).
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: api.home })

export const useProfile = (tag: string) => useQuery({ queryKey: ['profile', tag], queryFn: () => api.profile(tag) })

export const useSearch = (q: string) =>
  useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length >= 2, staleTime: 15000, placeholderData: (prev) => prev })

/** Queries holding per-user title state; invalidated after any mutation. */
export const DYNAMIC_KEYS = ['home', 'titles', 'search', 'profile', 'progress', 'ratings', 'highlights', 'ranking'] as const
