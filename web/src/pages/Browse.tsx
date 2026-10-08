import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api, type TitleFilters } from '../api'
import { useAuth } from '../auth'
import LiveCard from '../components/LiveCard'
import { SearchX, X } from 'lucide-react'
import { GridSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import ProviderPicker, { type PickerOption } from '../components/ProviderPicker'
import { ProviderLogo } from '../components/Providers'
import StickyBar from '../components/StickyBar'
import { parseIds, parsePType, PTYPES, type PType } from '../lib/providers'
import { useProviders, useStudios } from '../queries'

const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940, 1930]
const SORTS: [string, string][] = [
  ['popular', 'Popular'],
  ['group-watched', 'Más vistas del grupo'],
  ['year', 'Año'],
  ['score', 'Puntaje del grupo'],
  ['title', 'Título A-Z'],
  ['added', 'Agregadas recientemente'],
]
const KEYS = ['type', 'studio', 'decade', 'status', 'sort', 'q', 'provider', 'ptype'] as const

/** "Ver todo": every title across all catalogs, filterable, loaded 60 at a time. */
export default function Browse() {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const [params, setParams] = useSearchParams()
  const studios = useStudios()
  const providers = useProviders()

  const filters = useMemo<TitleFilters>(() => {
    const f: TitleFilters = {}
    KEYS.forEach((k) => {
      const v = params.get(k)
      if (v) f[k] = v
    })
    const ids = parseIds(f.provider ?? null)
    if (ids.length) f.provider = ids.join(',')
    else delete f.provider
    if (!f.provider || !parsePType(f.ptype ?? null)) delete f.ptype // the type only narrows a platform pick
    return f
  }, [params])
  const set = (k: (typeof KEYS)[number], v: string) => {
    const next = new URLSearchParams(params)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  // Where to watch: provider=8,337 (multi-select) and ptype (only meaningful with a platform picked).
  const providerIds = useMemo(() => parseIds(params.get('provider')), [params])
  const ptype = providerIds.length ? parsePType(params.get('ptype')) : ''
  const setProviders = (ids: number[]) => {
    const next = new URLSearchParams(params)
    if (ids.length) next.set('provider', ids.join(','))
    else {
      next.delete('provider')
      next.delete('ptype')
    }
    setParams(next, { replace: true })
  }
  const options = useMemo<PickerOption[]>(
    () => [...(providers.data ?? [])]
      .sort((a, b) => b.flatrateCount - a.flatrateCount || b.titleCount - a.titleCount || a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, name: p.name, logoUrl: p.logoUrl, count: p.titleCount })),
    [providers.data],
  )
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])

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

  const anyFilter = KEYS.some((k) => params.has(k))

  return (
    <>
      <header className="page-head">
        <h1 className="title">Catálogo</h1>
        <p className="lead">{total === undefined ? 'Todos los títulos de todos los estudios.' : `${total} ${total === 1 ? 'título' : 'títulos'}${anyFilter ? ' con estos filtros' : ''}`}</p>
      </header>

      <StickyBar label="Filtros del catálogo">
        <div className="filters">
          {filters.q && (
            <button type="button" className="chip-q" onClick={() => set('q', '')} aria-label={`Quitar la búsqueda “${filters.q}”`}>
              “{filters.q}” <X size={14} aria-hidden="true" />
            </button>
          )}
          <select value={filters.type ?? 'all'} onChange={(e) => set('type', e.target.value)} aria-label="Tipo">
            <option value="all">Películas y series</option>
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
            <option value="all">Vistas y sin ver</option>
            <option value="watched">Vistas</option>
            <option value="unwatched">Sin ver</option>
            <option value="pending">Pendientes</option>
          </select>
          <ProviderPicker options={options} selected={providerIds} onChange={setProviders} ptype={ptype} onPType={(t: PType) => set('ptype', t)} summary={false} />
          {providerIds.map((id) => {
            const o = optionById.get(id)
            const name = o?.name ?? `Plataforma ${id}`
            return (
              <button key={id} type="button" className="chip-q prov-chip" onClick={() => setProviders(providerIds.filter((x) => x !== id))} aria-label={`Quitar el filtro ${name}`}>
                <ProviderLogo info={o} />{name} <X size={14} aria-hidden="true" />
              </button>
            )
          })}
          {ptype && (
            <button type="button" className="chip-q" onClick={() => set('ptype', '')} aria-label={`Quitar el filtro de tipo ${PTYPES.find(([v]) => v === ptype)?.[1]}`}>
              Solo {PTYPES.find(([v]) => v === ptype)?.[1].toLowerCase()} <X size={14} aria-hidden="true" />
            </button>
          )}
          <select value={filters.sort ?? 'popular'} onChange={(e) => set('sort', e.target.value === 'popular' ? '' : e.target.value)} aria-label="Ordenar por">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </StickyBar>

      <div className="results">
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <GridSkeleton cards={12} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No hay títulos con estos filtros"
            action={anyFilter && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Quitar los filtros</button>}
          >
            Prueba con otra década, otro estudio, otra plataforma o una búsqueda más corta.
          </EmptyState>
        ) : (
          <>
            <div className="grid">
              {items.map((t) => <LiveCard key={t.id} item={t} me={me} showStudio />)}
            </div>
            <div ref={sentinel} className="sentinel">
              {isFetchingNextPage ? <GridSkeleton cards={6} /> : hasNextPage && <button type="button" className="btn btn-ghost" onClick={() => void fetchNextPage()}>Cargar más</button>}
            </div>
          </>
        )}
      </div>
    </>
  )
}
