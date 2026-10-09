import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigationType, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { RatingRow, StateTitle, Studio, TitleFilters } from '../api'
import { useAuth } from '../auth'
import LiveCard from '../components/LiveCard'
import { LoaderCircle, SearchX, X } from 'lucide-react'
import { GridSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import ProviderPicker, { type PickerOption } from '../components/ProviderPicker'
import { ProviderLogo } from '../components/Providers'
import StickyBar from '../components/StickyBar'
import { TmdbPanel } from '../components/TmdbResults'
import { reducedMotion, scrollBehavior } from '../lib/motion'
import { dropTitles } from '../lib/titleCache'
import { parseIds, parsePType, PTYPES, type PType } from '../lib/providers'
import { useProviders, useStudios, useTitlesList } from '../queries'

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
// Catch-all category studios that duplicate the type select: never offered as a studio ("Anime" stays).
const TYPE_CATEGORIES = new Set(['peliculas', 'series'])

/** Titles the studio has of that type ('all' or none: movies + series). */
const countOf = (s: Studio, type: string | undefined) =>
  type === 'movie' ? s.filmCount : type === 'series' ? s.seriesCount : s.movieCount
const offered = (s: Studio, type: string | undefined) =>
  !(s.kind === 'category' && TYPE_CATEGORIES.has(s.slug)) && countOf(s, type) > 0

/** Whether a title's (possibly patched) state still matches the seen filter the server applied to the list. */
const matchesStatus = (r: RatingRow, status: string | undefined) =>
  status === 'watched' ? r.watched : status === 'unwatched' ? !r.watched : status === 'pending' ? r.pending : true

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
  // The studio select only offers studios with titles of the selected type; a studio param it does not offer (after a
  // type change, or an old URL with "Películas"/"Series") is dropped in the same URL update.
  const studioOptions = useMemo(() => (studios.data ?? []).filter((s) => offered(s, filters.type)), [studios.data, filters.type])
  const compatible = useCallback((p: URLSearchParams) => {
    const s = studios.data?.find((x) => x.slug === p.get('studio'))
    if (!s || offered(s, p.get('type') ?? undefined)) return p
    const next = new URLSearchParams(p)
    next.delete('studio')
    return next
  }, [studios.data])
  useEffect(() => {
    const next = compatible(params)
    if (next !== params) setParams(next, { replace: true })
  }, [compatible, params, setParams])
  const set = (k: (typeof KEYS)[number], v: string) => {
    const next = new URLSearchParams(params)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setParams(compatible(next), { replace: true })
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

  const list = useTitlesList(filters)
  // Previous filter's grid, shown dimmed while the new one loads.
  const switching = list.isPlaceholderData

  // Infinite scroll: load the next page when the sentinel gets close to the viewport.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || switching) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !isFetchingNextPage && void fetchNextPage(), { rootMargin: '700px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, switching])

  // Pages are keyset-paginated, so the server does not resend titles; a title whose rank dropped while the user
  // scrolled can still come back on a later page: keep its first copy only.
  const pages = list.data?.pages
  const items = useMemo(() => {
    const seen = new Set<number>()
    const out: StateTitle[] = []
    for (const p of pages ?? []) {
      for (const t of p.items) {
        if (!seen.has(t.id)) {
          seen.add(t.id)
          out.push(t)
        }
      }
    }
    return out
  }, [pages])
  const total = pages?.[0]?.total

  // A card action can make a title stop matching the seen filter (e.g. marked seen under "Sin ver"): its card fades
  // out, then only that title leaves the cached pages; nothing refetches and the other cards keep their order.
  const qc = useQueryClient()
  const leaving = useMemo(
    () => new Set(switching ? [] : items.filter((t) => !matchesStatus(t.state, filters.status)).map((t) => t.id)),
    [items, filters.status, switching],
  )
  const leavingKey = [...leaving].join(',')
  useEffect(() => {
    if (!leavingKey) return
    const ids = new Set(leavingKey.split(',').map(Number))
    const timer = setTimeout(() => dropTitles(qc, ['titles', filters], ids), reducedMotion() ? 0 : 200)
    return () => clearTimeout(timer) // the title matched again (undone from the modal) or the filter changed
  }, [leavingKey, qc, filters])

  // A new filter, sort or search starts at the top of the results once they arrive (back/forward restores the old
  // position instead). The results begin right under the filters, so this is the page top: aiming at the grid itself
  // lands short or long, as the sticky filter bar changes height when it unsticks.
  const results = useRef<HTMLDivElement>(null)
  const navType = useNavigationType()
  const filterKey = JSON.stringify(filters)
  const shownKey = useRef(filterKey)
  const scrollPending = useRef(false)
  useEffect(() => {
    if (shownKey.current !== filterKey) {
      shownKey.current = filterKey
      scrollPending.current = navType !== 'POP'
    }
    const el = results.current
    if (!scrollPending.current || switching || !el) return
    scrollPending.current = false
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
    if (el.getBoundingClientRect().top < margin) window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }, [filterKey, navType, switching])

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
            {studioOptions.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
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

      <div className={`results ${switching ? 'is-switching' : ''}`} ref={results} aria-busy={switching || undefined}>
        {switching && (
          <div className="results-loading" role="status">
            <span><LoaderCircle size={16} className="spin" aria-hidden="true" />Cargando…</span>
          </div>
        )}
        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <GridSkeleton cards={12} />
        ) : items.length === 0 && filters.q && (filters.q.trim().length >= 2) ? (
          <>
            <TmdbPanel q={filters.q.trim()} />
            {KEYS.some((k) => k !== 'q' && params.has(k)) && (
              <p className="tmdb-filters-note">
                También hay otros filtros activos.{' '}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setParams(new URLSearchParams({ q: filters.q ?? '' }), { replace: true })}>Buscar sin filtros</button>
              </p>
            )}
          </>
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
              {items.map((t) => <LiveCard key={t.id} item={t} me={me} showStudio leaving={leaving.has(t.id)} />)}
            </div>
            <div ref={sentinel} className="sentinel">
              {isFetchingNextPage ? <GridSkeleton cards={6} /> : hasNextPage && !switching && <button type="button" className="btn btn-ghost" onClick={() => void fetchNextPage()}>Cargar más</button>}
            </div>
          </>
        )}
      </div>
    </>
  )
}
