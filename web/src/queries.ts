import { useQuery } from '@tanstack/react-query'
import { api } from './api'

const HOUR = 60 * 60 * 1000

// Static data: titles, posters, studios. The server answers revalidations with 304.
export const useStudios = () =>
  useQuery({ queryKey: ['studios'], queryFn: api.studios, staleTime: HOUR, gcTime: 24 * HOUR })

export const useCatalog = (slug: string) =>
  useQuery({ queryKey: ['catalog', slug], queryFn: () => api.catalog(slug), staleTime: HOUR, gcTime: 24 * HOUR })

// Dynamic data.
export const useProgress = () => useQuery({ queryKey: ['progress'], queryFn: api.progress })

export const useRanking = () =>
  useQuery({ queryKey: ['ranking'], queryFn: api.ranking, refetchInterval: 15000, refetchIntervalInBackground: false })
