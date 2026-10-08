import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type ImportResult, type TmdbResult } from '../api'
import { toast } from './toast'

/** Per-result add state, shared by the header dropdown and the /catalogo panel (same title, same state). */
export type AddState = { status: 'adding' } | { status: 'added'; result: ImportResult } | { status: 'error'; message: string }

let states = new Map<string, AddState>()
const listeners = new Set<() => void>()
const set = (key: string, s: AddState | null) => {
  states = new Map(states)
  if (s) states.set(key, s)
  else states.delete(key)
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const resultKey = (r: Pick<TmdbResult, 'mediaType' | 'tmdbId'>) => `${r.mediaType}:${r.tmdbId}`
export const titleLink = (studioSlug: string, id: number) => `/studio/${studioSlug}?t=${id}`

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'unreleased') return 'Todavía no se estrenó: solo se pueden agregar títulos ya estrenados.'
    if (e.code === 'not_found') return 'TMDB ya no tiene este título.'
    if (e.code === 'tmdb_unavailable' || e.status === 502) return 'TMDB no respondió. Inténtalo de nuevo en un momento.'
    if (e.status === 401) return e.message
  }
  return 'No se pudo agregar. Inténtalo de nuevo.'
}

/** Adds TMDB titles to the catalog: optimistic "Agregando…", success toast with a "Ver" link, error toast. */
export function useAddTitle() {
  const qc = useQueryClient()
  const all = useSyncExternalStore(subscribe, () => states)

  const add = useCallback(async (r: TmdbResult) => {
    const key = resultKey(r)
    if (states.get(key)?.status === 'adding') return
    set(key, { status: 'adding' })
    try {
      const res = await api.importTitle(r.tmdbId, r.mediaType)
      set(key, { status: 'added', result: res })
      toast({
        tone: 'ok',
        text: res.created ? `“${res.title.title}” agregada a ${res.studio.name}` : `“${res.title.title}” ya estaba en ${res.studio.name}`,
        link: { to: titleLink(res.studio.slug, res.title.id), label: 'Ver' },
      })
      // Everything that lists titles or counts them: studios, home, search, global grid, that studio's catalog.
      for (const k of [['studios'], ['home'], ['search'], ['titles'], ['tmdb'], ['progress'], ['catalog', res.studio.slug], ['ratings', res.studio.slug]]) {
        void qc.invalidateQueries({ queryKey: k })
      }
    } catch (e) {
      const message = errorMessage(e)
      set(key, { status: 'error', message })
      toast({ tone: 'error', text: `No se agregó “${r.title}”. ${message}` }, 8000)
    }
  }, [qc])

  return { states: all, add }
}
