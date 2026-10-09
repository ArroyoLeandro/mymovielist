import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Movie, type RatingRow } from '../api'
import { useAuth } from '../auth'
import { Clapperboard, SearchX } from 'lucide-react'
import GridSection from '../components/GridSection'
import ProviderPicker, { type PickerOption } from '../components/ProviderPicker'
import SectionNav from '../components/SectionNav'
import { CatalogSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import StickyBar from '../components/StickyBar'
import Tabs, { type TabItem } from '../components/Tabs'
import TitleCard, { type PendingFn, type SaveFn } from '../components/TitleCard'
import { matchesProviders, ProviderDictContext, type PType } from '../lib/providers'
import { blankRow, isEmptyRow, patchEntry, upsertRow } from '../lib/ratings'
import { scrollToExact } from '../lib/scrollToExact'
import { patchTitle } from '../lib/titleCache'
import { useCatalog } from '../queries'

type Filter = 'all' | 'watched' | 'unwatched'
type Tab = 'todas' | 'peliculas' | 'series' | 'sagas'
const TAB_IDS: Tab[] = ['todas', 'peliculas', 'series', 'sagas']

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ---- optimistic patching of the ratings cache ----
const rowOf = (rows: RatingRow[], movieId: number) => rows.find((r) => r.movieId === movieId) ?? blankRow(movieId)

function patchRows(rows: RatingRow[], movieId: number, tag: string, watched: boolean, score: number | null): RatingRow[] {
  return upsertRow(rows, patchEntry(rowOf(rows, movieId), tag, watched, score))
}

function restoreRow(rows: RatingRow[], movieId: number, prev: RatingRow | undefined): RatingRow[] {
  const rest = rows.filter((r) => r.movieId !== movieId)
  return prev && !isEmptyRow(prev) ? [...rest, prev] : rest
}

export default function Catalog() {
  const { slug = '' } = useParams()
  return <CatalogView key={slug} slug={slug} /> // remount per studio: local UI state starts fresh
}

function CatalogView({ slug }: { slug: string }) {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const qc = useQueryClient()
  const catalog = useCatalog(slug)
  const ratingsKey = useMemo(() => ['ratings', slug], [slug])
  const entryKey = ['entry']
  const mutating = useIsMutating({ mutationKey: entryKey })

  // Dynamic data. Polls every 8 s while visible; never while a save is in flight (stale-edit guard),
  // and an in-flight poll is cancelled when an edit starts (see onMutate).
  const ratings = useQuery({
    queryKey: ratingsKey,
    queryFn: () => api.ratings(slug),
    refetchInterval: mutating > 0 ? false : 8000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: () => qc.isMutating({ mutationKey: entryKey }) === 0,
  })

  const save = useMutation({
    mutationKey: entryKey,
    mutationFn: (v: { movieId: number; watched: boolean; score: number | null }) => api.saveEntry(v.movieId, v.watched, v.score),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ratingsKey }) // drop any poll that started before this edit
      const prev = qc.getQueryData<RatingRow[]>(ratingsKey)?.find((r) => r.movieId === v.movieId)
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => patchRows(rows ?? [], v.movieId, me, v.watched, v.score))
      return { prev }
    },
    onError: (_e, v, ctx) => {
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => restoreRow(rows ?? [], v.movieId, ctx?.prev))
    },
    onSuccess: (entry, v) => {
      // Server is the source of truth, unless a newer save is still in flight.
      if (qc.isMutating({ mutationKey: entryKey }) <= 1) {
        qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => patchRows(rows ?? [], v.movieId, me, entry.watched, entry.score))
      }
      // Same title in the global lists (home, /catalogo, search): patched in place, refetched on their next visit.
      patchTitle(qc, v.movieId, (row) => patchEntry(row, me, entry.watched, entry.score))
    },
    onSettled: () => {
      // Once every in-flight save is done, refresh community stats and the home progress.
      if (qc.isMutating({ mutationKey: entryKey }) <= 1) {
        void qc.invalidateQueries({ queryKey: ratingsKey })
        void qc.invalidateQueries({ queryKey: ['progress'] })
        for (const k of ['home', 'titles', 'search', 'profile']) void qc.invalidateQueries({ queryKey: [k], refetchType: 'none' })
      }
    },
  })
  // Titles acted upon stay visible under the current filter ("Sin ver" keeps a title just marked as watched) until
  // the filter, search or tab changes: the grid never drops a card under the user.
  const [kept, setKept] = useState<ReadonlySet<number>>(new Set())
  const keep = useCallback((movieId: number) => setKept((k) => (k.has(movieId) ? k : new Set(k).add(movieId))), [])

  const { mutateAsync } = save
  const onSave = useCallback<SaveFn>(
    (movieId, watched, score) => {
      keep(movieId)
      return mutateAsync({ movieId, watched, score }).then(() => true, () => false)
    },
    [mutateAsync, keep],
  )

  const pend = useMutation({
    mutationFn: (v: { movieId: number; pending: boolean }) => api.setPending(v.movieId, v.pending),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ratingsKey })
      const prev = qc.getQueryData<RatingRow[]>(ratingsKey)?.find((r) => r.movieId === v.movieId)
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => upsertRow(rows ?? [], { ...rowOf(rows ?? [], v.movieId), pending: v.pending }))
      return { prev }
    },
    onError: (_e, v, ctx) => {
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => restoreRow(rows ?? [], v.movieId, ctx?.prev))
    },
    onSuccess: (_r, v) => patchTitle(qc, v.movieId, (row) => ({ ...row, pending: v.pending })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ratingsKey })
      for (const k of ['home', 'titles', 'search', 'profile']) void qc.invalidateQueries({ queryKey: [k], refetchType: 'none' })
    },
  })
  const { mutateAsync: mutatePending } = pend
  const onPending = useCallback<PendingFn>(
    (movieId, pending) => {
      keep(movieId)
      return mutatePending({ movieId, pending }).then(() => true, () => false)
    },
    [mutatePending, keep],
  )

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  // Where to watch (client-side over the catalog payload): picked platforms and offer type.
  const [provSel, setProvSel] = useState<number[]>([])
  const [ptype, setPtype] = useState<PType>('')
  const provSet = useMemo(() => new Set(provSel), [provSel])
  const pickProviders = useCallback((ids: number[]) => {
    setProvSel(ids)
    if (ids.length === 0) setPtype('')
  }, [])
  useEffect(() => setKept(new Set()), [query, filter, provSel, ptype])
  // Sections always start expanded; collapsing is per visit and resets when the studio changes.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const byId = useMemo(() => new Map((ratings.data ?? []).map((r) => [r.movieId, r])), [ratings.data])
  const sections = catalog.data?.sections
  const sagas = catalog.data?.sagas
  const all = useMemo(() => sections?.flatMap((s) => s.movies) ?? [], [sections])
  const haystack = useMemo(() => new Map(all.map((m) => [m.id, norm(`${m.title} ${m.originalTitle ?? ''}`)])), [all])
  const titleById = useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const sectionOf = useMemo(() => new Map((sections ?? []).flatMap((s) => s.movies.map((m) => [m.id, s] as const))), [sections])
  const dictMap = useMemo(
    () => new Map(Object.entries(catalog.data?.providers ?? {}).map(([id, p]) => [Number(id), p])),
    [catalog.data?.providers],
  )
  // Platforms used by this studio, most titles on subscription first; the count is titles on that platform.
  const providerOptions = useMemo<PickerOption[]>(() => {
    const n = new Map<number, { all: Set<number>; sub: Set<number> }>()
    for (const m of all) {
      for (const p of m.providers ?? []) {
        const c = n.get(p.id) ?? { all: new Set<number>(), sub: new Set<number>() }
        c.all.add(m.id)
        if (p.type === 'flatrate' || p.type === 'free' || p.type === 'ads') c.sub.add(m.id)
        n.set(p.id, c)
      }
    }
    return [...n.entries()]
      .map(([id, c]) => ({ id, name: dictMap.get(id)?.name ?? `Plataforma ${id}`, logoUrl: dictMap.get(id)?.logoUrl ?? null, count: c.all.size, sub: c.sub.size }))
      .sort((a, b) => b.sub - a.sub || b.count - a.count || a.name.localeCompare(b.name))
      .map(({ sub: _sub, ...o }) => o)
  }, [all, dictMap])
  const moviesCount = useMemo(() => all.filter((m) => m.mediaType === 'movie').length, [all])
  const seriesCount = all.length - moviesCount

  // Tabs: "Todas" (default) is the whole catalog; Películas / Series only when they differ from it; Sagas when any.
  const [params, setParams] = useSearchParams()
  const tabs: TabItem<Tab>[] = [
    { id: 'todas', label: 'Todas', count: all.length },
    ...(moviesCount > 0 && seriesCount > 0
      ? [{ id: 'peliculas' as Tab, label: 'Películas', count: moviesCount }, { id: 'series' as Tab, label: 'Series', count: seriesCount }]
      : []),
    ...(sagas && sagas.length > 0
      ? [{ id: 'sagas' as Tab, label: 'Sagas', count: sagas.length, countLabel: `${sagas.length} ${sagas.length === 1 ? 'saga' : 'sagas'}` }]
      : []),
  ]
  const urlTab = params.get('tab') as Tab | null
  const tab: Tab = urlTab && TAB_IDS.includes(urlTab) && tabs.some((t) => t.id === urlTab) ? urlTab : 'todas'
  const setTab = useCallback((t: Tab) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (t === 'todas') next.delete('tab')
      else next.set('tab', t)
      return next
    }, { replace: true })
  }, [setParams])

  // Deep links from search / home: ?t=<title id> opens "Todas", ?saga=<slug> opens "Sagas"; the target scrolls into view and flashes.
  const jumpT = params.get('t')
  const jumpSaga = params.get('saga')
  const jumpKey = jumpT ? `t${jumpT}` : jumpSaga ? `s${jumpSaga}` : ''
  const handled = useRef('')
  const ready = !!(catalog.data && ratings.data)
  const needTab: Tab | null = jumpT ? (titleById.has(Number(jumpT)) ? 'todas' : null) : jumpSaga ? 'sagas' : null
  useEffect(() => {
    if (!ready || !jumpKey || handled.current === jumpKey || !needTab) return
    if (tab !== needTab || query || filter !== 'all' || provSel.length > 0) {
      setTab(needTab)
      setQuery('')
      setFilter('all')
      pickProviders([])
      return
    }
    const sec = jumpT ? sectionOf.get(Number(jumpT))?.slug : undefined
    if (sec && collapsed.has(sec)) {
      setCollapsed((c) => {
        const n = new Set(c)
        n.delete(sec)
        return n
      })
      return
    }
    handled.current = jumpKey
    setTimeout(() => {
      const el = document.getElementById(jumpT ? `t-${jumpT}` : `saga-${jumpSaga}`)
      if (!el) return
      void scrollToExact(el, jumpT ? 'center' : 'start')
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 2400)
    }, 80)
  }, [ready, jumpKey, jumpT, jumpSaga, needTab, tab, query, filter, provSel, collapsed, sectionOf, setTab, pickProviders])

  if ((catalog.error && !catalog.data) || (ratings.error && !ratings.data)) {
    return <ErrorState error={catalog.error ?? ratings.error} onRetry={() => { void catalog.refetch(); void ratings.refetch() }} />
  }
  if (!catalog.data || !sections || !sagas || !ratings.data) return <CatalogSkeleton />

  const studioName = catalog.data.studio.name
  const watchedCount = ratings.data.filter((r) => r.watched).length // whole studio, whatever the tab
  const pct = all.length ? Math.round((watchedCount / all.length) * 100) : 0

  const q = norm(query.trim())
  const searching = q !== '' || filter !== 'all' || provSet.size > 0
  const visible = (m: Movie) => {
    const watched = byId.get(m.id)?.watched ?? false
    return (filter === 'all' || (filter === 'watched') === watched || kept.has(m.id)) && (!q || haystack.get(m.id)!.includes(q))
      && matchesProviders(m.providers, provSet, ptype)
  }

  // Todas / Películas / Series keep the studio's sections (eras, decades, genres) as headers.
  const kind = tab === 'peliculas' ? 'movie' : tab === 'series' ? 'series' : null
  const viewSections = sections
    .map((s) => ({ ...s, movies: kind ? s.movies.filter((m) => m.mediaType === kind) : s.movies }))
    .filter((s) => s.movies.length > 0)
  const grouped = viewSections.length > 1
  const shown = viewSections.map((s) => ({ s, movies: s.movies.filter(visible) })).filter((x) => !searching || x.movies.length > 0)
  const shownSagas = sagas
    .map((sg) => {
      const movies = sg.titleIds.map((id) => titleById.get(id)).filter((m): m is Movie => !!m)
      return { sg, movies, visibleMovies: movies.filter(visible) }
    })
    .filter((x) => x.visibleMovies.length > 0)
  const empty = tab === 'sagas' ? shownSagas.length === 0 : shown.every((x) => x.movies.length === 0)

  const toggle = (slug: string) =>
    setCollapsed((c) => {
      const n = new Set(c)
      if (!n.delete(slug)) n.add(slug)
      return n
    })
  const jump = (slug: string) => {
    if (collapsed.has(slug)) toggle(slug)
    requestAnimationFrame(() => {
      const el = document.getElementById(`sec-${slug}`)
      if (el) void scrollToExact(el, 'start')
    })
  }
  const allCollapsed = viewSections.every((s) => collapsed.has(s.slug))
  const card = (m: Movie, sectionName?: string) => (
    <TitleCard key={m.id} movie={m} r={byId.get(m.id)} onSave={onSave} onPending={onPending} studioName={studioName} sectionName={sectionName ?? sectionOf.get(m.id)?.name} />
  )

  return (
    <ProviderDictContext.Provider value={dictMap}>
      <header className="studio-head">
        <div className="progress-text"><h1 className="title">{studioName}</h1><span>{watchedCount}/{all.length} vistas &middot; {pct}%</span></div>
        <div className="meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      </header>

      <StickyBar label="Herramientas del catálogo">
        <div className="bar">
          <p className="bar-name" aria-hidden="true"><span>{studioName}</span><span>{pct}%</span></p>
          <div className="bar-line">
            <Tabs label="Vista del catálogo" items={tabs} value={tab} onChange={setTab} />
            <div className="seg seg-sm" role="group" aria-label="Filtrar por estado">
              {(['all', 'watched', 'unwatched'] as Filter[]).map((f) => (
                <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'Vistas y sin ver' : f === 'watched' ? 'Vistas' : 'Sin ver'}
                </button>
              ))}
            </div>
            {providerOptions.length > 0 && (
              <ProviderPicker options={providerOptions} selected={provSel} onChange={pickProviders} ptype={ptype} onPType={setPtype} />
            )}
          </div>
          {tab !== 'sagas' && grouped && (
            <SectionNav
              sections={viewSections.map((s) => ({ slug: s.slug, name: s.name, period: s.period, count: s.movies.length }))}
              visibleSlugs={shown.map((x) => x.s.slug)}
              allCollapsed={allCollapsed}
              onJump={jump}
              onToggleAll={() => setCollapsed(allCollapsed ? new Set() : new Set(viewSections.map((s) => s.slug)))}
            />
          )}
          <div className="bar-search">
            <input type="search" placeholder={`Buscar en ${studioName}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Buscar por título en ${studioName}`} enterKeyHint="search" />
          </div>
        </div>
        <span className="bar-progress" style={{ width: `${pct}%` }} aria-hidden="true" />
      </StickyBar>

      {tab === 'sagas' && shownSagas.map(({ sg, movies, visibleMovies }) => (
        <GridSection key={sg.slug} id={`saga-${sg.slug}`} name={sg.name} meta={`(${movies.length}) · ${movies.filter((m) => byId.get(m.id)?.watched).length}/${movies.length} vistas`}>
          {visibleMovies.map((m) => card(m))}
        </GridSection>
      ))}

      {tab !== 'sagas' && !grouped && shown[0] && (
        <div className="grid results era-body">{shown[0].movies.map((m) => card(m, shown[0].s.name))}</div>
      )}

      {tab !== 'sagas' && grouped && shown.map(({ s, movies }) => {
        const open = searching || !collapsed.has(s.slug)
        const seen = s.movies.filter((m) => byId.get(m.id)?.watched).length
        return (
          <section key={s.slug} id={`sec-${s.slug}`} className="era">
            <h2>
              <button type="button" className="era-toggle" aria-expanded={open} onClick={() => toggle(s.slug)} disabled={searching}>
                <i className={`chev ${open ? 'open' : ''}`} aria-hidden="true" />
                {s.name} {s.period && <span className="period">{s.period}</span>}
                <em>{seen}/{s.movies.length} vistas</em>
              </button>
            </h2>
            {open && <div className="grid era-body">{movies.map((m) => card(m, s.name))}</div>}
          </section>
        )
      })}

      {empty && (all.length === 0 ? (
        <EmptyState icon={Clapperboard} title="Este estudio todavía no tiene títulos" />
      ) : (
        <EmptyState
          icon={SearchX}
          title="Nada coincide con tu búsqueda"
          action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setFilter('all'); pickProviders([]) }}>Mostrar todo</button>}
        >
          Prueba con otra palabra o cambia los filtros de vistas y plataforma.
        </EmptyState>
      ))}
    </ProviderDictContext.Provider>
  )
}
