import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api, type TitleFilters } from '../api'
import { useAuth } from '../auth'
import LiveCard from '../components/LiveCard'
import { GridSkeleton } from '../components/Skeleton'
import { useStudios } from '../queries'

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940, 1930]
const SORTS: [string, string][] = [
  ['popular', 'Popular'],
  ['group-watched', 'Más vistas del grupo'],
  ['year', 'Año'],
  ['score', 'Puntaje del grupo'],
  ['title', 'Título A-Z'],
]
const KEYS = ['type', 'studio', 'decade', 'status', 'sort', 'q'] as const

/** "Ver todo": every title across all catalogs, filterable, loaded 60 at a time. */
export default function Browse() {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const [params, setParams] = useSearchParams()
  const studios = useStudios()

  const filters = useMemo<TitleFilters>(() => {
    const f: TitleFilters = {}
    KEYS.forEach((k) => {
      const v = params.get(k)
      if (v) f[k] = v
    })
    return f
  }, [params])
  const set = (k: (typeof KEYS)[number], v: string) => {
    const next = new URLSearchParams(params)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const list = useInfiniteQuery({
    queryKey: ['titles', filters],
    queryFn: ({ pageParam }) => api.titles(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  })

  // Infinite scroll: load the next page when the sentinel gets close to the viewport.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !isFetchingNextPage && void fetchNextPage(), { rootMargin: '700px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const total = list.data?.pages[0]?.total

  return (
    <>
      <h1 className="title">Catálogo</h1>
      <p className="muted">{total === undefined ? 'Todos los títulos de todos los estudios.' : `${total} ${total === 1 ? 'título' : 'títulos'}`}</p>

      <div className="filter-row browse-filters">
        <select value={filters.type ?? 'all'} onChange={(e) => set('type', e.target.value)} aria-label="Tipo">
          <option value="all">Todo</option>
          <option value="movie">Películas</option>
          <option value="series">Series</option>
        </select>
        <select value={filters.studio ?? 'all'} onChange={(e) => set('studio', e.target.value)} aria-label="Estudio o categoría">
          <option value="all">Todos los estudios</option>
          {(studios.data ?? []).map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        <select value={filters.decade ?? 'all'} onChange={(e) => set('decade', e.target.value)} aria-label="Década">
          <option value="all">Todas las décadas</option>
          {DECADES.map((d) => <option key={d} value={d}>{d}s</option>)}
        </select>
        <select value={filters.status ?? 'all'} onChange={(e) => set('status', e.target.value)} aria-label="Estado">
          <option value="all">Todas</option>
          <option value="watched">Vistas</option>
          <option value="unwatched">Sin ver</option>
          <option value="pending">Pendientes</option>
        </select>
        <select value={filters.sort ?? 'popular'} onChange={(e) => set('sort', e.target.value === 'popular' ? '' : e.target.value)} aria-label="Ordenar por">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {filters.q && (
          <button className="chip-q" onClick={() => set('q', '')} aria-label="Quitar la búsqueda">
            “{filters.q}” <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      {list.error && !list.data ? (
        <p className="error">{list.error.message}</p>
      ) : !list.data ? (
        <GridSkeleton cards={12} />
      ) : items.length === 0 ? (
        <p className="muted">No hay títulos con esos filtros.</p>
      ) : (
        <>
          <div className="grid">
            {items.map((t) => <LiveCard key={t.id} item={t} me={me} showStudio />)}
          </div>
          <div ref={sentinel} className="sentinel">
            {isFetchingNextPage ? <GridSkeleton cards={6} /> : hasNextPage && <button className="ghost" onClick={() => void fetchNextPage()}>Cargar más</button>}
          </div>
        </>
      )}
    </>
  )
}
