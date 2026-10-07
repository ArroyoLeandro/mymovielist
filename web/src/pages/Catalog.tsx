import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Movie, type RatingRow } from '../api'
import { useAuth } from '../auth'
import Poster from '../components/Poster'
import SagaRow from '../components/SagaRow'
import SectionNav from '../components/SectionNav'
import { CatalogSkeleton } from '../components/Skeleton'
import { useCatalog } from '../queries'

type Filter = 'all' | 'watched' | 'unwatched'
type Tab = 'sagas' | 'movies' | 'series'
type SaveFn = (movieId: number, watched: boolean, score: number | null) => Promise<boolean>

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ---- optimistic patching of the ratings cache ----
const byScore = (a: { tag: string; score: number | null }, b: { tag: string; score: number | null }) =>
  (b.score ?? -1) - (a.score ?? -1) || a.tag.localeCompare(b.tag)

function applyEntry(rows: RatingRow[], movieId: number, tag: string, watched: boolean, score: number | null): RatingRow[] {
  const i = rows.findIndex((r) => r.movieId === movieId)
  const row: RatingRow = i >= 0 ? rows[i] : { movieId, watched: false, score: null, ratings: [], watchersCount: 0, averageScore: null }
  const others = row.ratings.filter((r) => r.tag !== tag)
  const ratings = watched ? [...others, { tag, score }].sort(byScore) : others
  if (ratings.length === 0) return rows.filter((r) => r.movieId !== movieId)
  const scored = ratings.filter((r) => r.score !== null) as { score: number }[]
  const next: RatingRow = {
    ...row,
    watched,
    score: watched ? score : null,
    ratings,
    watchersCount: ratings.length,
    averageScore: scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 100) / 100 : null,
  }
  return i >= 0 ? rows.map((r) => (r.movieId === movieId ? next : r)) : [...rows, next]
}

function restoreRow(rows: RatingRow[], movieId: number, prev: RatingRow | undefined): RatingRow[] {
  const rest = rows.filter((r) => r.movieId !== movieId)
  return prev ? [...rest, prev] : rest
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
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => applyEntry(rows ?? [], v.movieId, me, v.watched, v.score))
      return { prev }
    },
    onError: (_e, v, ctx) => {
      qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => restoreRow(rows ?? [], v.movieId, ctx?.prev))
    },
    onSuccess: (entry, v) => {
      // Server is the source of truth, unless a newer save is still in flight.
      if (qc.isMutating({ mutationKey: entryKey }) <= 1) {
        qc.setQueryData<RatingRow[]>(ratingsKey, (rows) => applyEntry(rows ?? [], v.movieId, me, entry.watched, entry.score))
      }
    },
    onSettled: () => {
      // Once every in-flight save is done, refresh community stats and the home progress.
      if (qc.isMutating({ mutationKey: entryKey }) <= 1) {
        void qc.invalidateQueries({ queryKey: ratingsKey })
        void qc.invalidateQueries({ queryKey: ['progress'] })
      }
    },
  })
  const { mutateAsync } = save
  const onSave = useCallback<SaveFn>(
    (movieId, watched, score) => mutateAsync({ movieId, watched, score }).then(() => true, () => false),
    [mutateAsync],
  )

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [tabPick, setTabPick] = useState<Tab | null>(null)
  // Sections always start expanded; collapsing is per visit and resets when the studio changes.
  const [collapsedState, setCollapsedState] = useState<{ slug: string; list: string[] }>({ slug, list: [] })

  const byId = useMemo(() => new Map((ratings.data ?? []).map((r) => [r.movieId, r])), [ratings.data])
  const sections = catalog.data?.sections
  const sagas = catalog.data?.sagas
  const all = useMemo(() => sections?.flatMap((s) => s.movies) ?? [], [sections])
  const haystack = useMemo(() => new Map(all.map((m) => [m.id, norm(`${m.title} ${m.originalTitle ?? ''}`)])), [all])
  const titleById = useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const inSaga = useMemo(() => new Set(sagas?.flatMap((s) => s.titleIds) ?? []), [sagas])
  // Movies tab: movies outside any saga, keeping the studio's sections. Series tab: every series.
  const movieSections = useMemo(
    () => (sections ?? []).map((s) => ({ ...s, movies: s.movies.filter((m) => m.mediaType === 'movie' && !inSaga.has(m.id)) })).filter((s) => s.movies.length > 0),
    [sections, inSaga],
  )
  const series = useMemo(() => all.filter((m) => m.mediaType === 'series'), [all])

  if ((catalog.error && !catalog.data) || (ratings.error && !ratings.data)) {
    return <p className="error">{(catalog.error ?? ratings.error)?.message}</p>
  }
  if (!catalog.data || !sections || !sagas || !ratings.data) return <CatalogSkeleton />

  const watchedCount = ratings.data.filter((r) => r.watched).length
  const pct = all.length ? Math.round((watchedCount / all.length) * 100) : 0

  const q = norm(query.trim())
  const searching = q !== '' || filter !== 'all'
  const visible = (m: Movie) => {
    const watched = byId.get(m.id)?.watched ?? false
    return (filter === 'all' || (filter === 'watched') === watched) && (!q || haystack.get(m.id)!.includes(q))
  }

  const moviesCount = movieSections.reduce((n, s) => n + s.movies.length, 0)
  const tabs = ([['sagas', 'Sagas', sagas.length], ['movies', 'Películas', moviesCount], ['series', 'Series', series.length]] as [Tab, string, number][]).filter((t) => t[2] > 0)
  const tab = tabs.find((t) => t[0] === tabPick)?.[0] ?? tabs[0]?.[0]

  const collapsed = new Set(collapsedState.slug === slug ? collapsedState.list : [])
  const setCollapsedList = (list: string[]) => setCollapsedState({ slug, list })
  const toggle = (sectionSlug: string) => {
    const next = new Set(collapsed)
    if (!next.delete(sectionSlug)) next.add(sectionSlug)
    setCollapsedList([...next])
  }
  const jump = (sectionSlug: string) => {
    if (collapsed.has(sectionSlug)) {
      const next = new Set(collapsed)
      next.delete(sectionSlug)
      setCollapsedList([...next])
    }
    requestAnimationFrame(() => document.getElementById(`sec-${sectionSlug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const allCollapsed = movieSections.every((s) => collapsed.has(s.slug))

  const shown = movieSections.map((s) => ({ s, movies: s.movies.filter(visible) })).filter((x) => !searching || x.movies.length > 0)
  const shownSagas = sagas
    .map((sg) => {
      const movies = sg.titleIds.map((id) => titleById.get(id)).filter((m): m is Movie => !!m)
      return { sg, movies, visibleMovies: movies.filter(visible) }
    })
    .filter((x) => x.visibleMovies.length > 0)
  const shownSeries = series.filter(visible)
  const empty = tab === 'sagas' ? shownSagas.length === 0 : tab === 'movies' ? shown.length === 0 : shownSeries.length === 0

  return (
    <>
      <div className="toolbar">
        <div className="progress">
          <div className="progress-text"><h1 className="title">{catalog.data.studio.name}</h1><span>{watchedCount}/{all.length} vistas &middot; {pct}%</span></div>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <input type="search" placeholder="Buscar por título" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar por título" />
        <div className="seg" role="group" aria-label="Filtro">
          {(['all', 'watched', 'unwatched'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todas' : f === 'watched' ? 'Vistas' : 'Sin ver'}
            </button>
          ))}
        </div>
      </div>

      <div className="seg tabs" role="tablist" aria-label="Contenido">
        {tabs.map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTabPick(key)}>
            {label} <small>{n}</small>
          </button>
        ))}
      </div>

      {tab === 'sagas' && shownSagas.map(({ sg, movies, visibleMovies }) => (
        <SagaRow key={sg.slug} name={sg.name} count={movies.length} seen={movies.filter((m) => byId.get(m.id)?.watched).length}>
          {visibleMovies.map((m) => <Card key={m.id} movie={m} r={byId.get(m.id)} me={me} onSave={onSave} />)}
        </SagaRow>
      ))}

      {tab === 'movies' && (
        <>
          {movieSections.length > 1 && (
            <SectionNav
              sections={movieSections.map((s) => ({ slug: s.slug, name: s.name, period: s.period, count: s.movies.length }))}
              visibleSlugs={shown.map((x) => x.s.slug)}
              allCollapsed={allCollapsed}
              onJump={jump}
              onToggleAll={() => setCollapsedList(allCollapsed ? [] : movieSections.map((s) => s.slug))}
            />
          )}
          {shown.map(({ s, movies }) => {
            const open = searching || !collapsed.has(s.slug)
            const seen = s.movies.filter((m) => byId.get(m.id)?.watched).length
            return (
              <section key={s.slug} id={`sec-${s.slug}`} className="era">
                <h2>
                  <button className="era-toggle" aria-expanded={open} onClick={() => toggle(s.slug)} disabled={searching}>
                    <i className={`chev ${open ? 'open' : ''}`} aria-hidden="true" />
                    {s.name} <span>{s.period}</span>
                    <em>{seen}/{s.movies.length}</em>
                  </button>
                </h2>
                {open && (
                  <div className="grid era-body">
                    {movies.map((m) => <Card key={m.id} movie={m} r={byId.get(m.id)} me={me} onSave={onSave} />)}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}

      {tab === 'series' && (
        <div className="grid era era-body">
          {shownSeries.map((m) => <Card key={m.id} movie={m} r={byId.get(m.id)} me={me} onSave={onSave} />)}
        </div>
      )}

      {empty && <p className="muted">{tab ? 'No hay títulos que coincidan. Borra la búsqueda o cambia el filtro.' : 'Este estudio aún no tiene títulos.'}</p>}
    </>
  )
}

const LABELS = ['Horrible', 'Malo', 'Flojo', 'Regular', 'Pasable', 'Decente', 'Bueno', 'Muy bueno', 'Excelente', 'Obra maestra']
const tier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')

const Card = memo(function Card({ movie: m, r, me, onSave }: { movie: Movie; r: RatingRow | undefined; me: string; onSave: SaveFn }) {
  const watched = r?.watched ?? false
  const score = r?.score ?? null
  const ratings = r?.ratings ?? []
  const watchersCount = r?.watchersCount ?? 0
  const [hover, setHover] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const group = useRef<HTMLDivElement>(null)

  const rate = async (n: number) => {
    setHover(null)
    setFailed(false)
    if (!(await onSave(m.id, true, score === n ? null : n))) {
      setFailed(true)
      setTimeout(() => setFailed(false), 3000)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (/^[0-9]$/.test(e.key)) return void rate(e.key === '0' ? 10 : Number(e.key))
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const btns = Array.from(group.current?.querySelectorAll('button') ?? [])
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[Math.min(9, Math.max(0, i + step))]?.focus()
  }
  const shown = hover ?? score
  return (
    <article className={`card ${watched ? 'seen' : ''}`}>
      <div className="art">
        <Poster url={m.posterUrl} title={m.title} />
        {m.mediaType === 'series' && <span className="badge">Serie</span>}
        <button
          className={`check ${watched ? 'on' : ''}`}
          aria-pressed={watched}
          aria-label={watched ? `Quitar ${m.title} de las vistas` : `Marcar ${m.title} como vista`}
          onClick={() => void onSave(m.id, !watched, null)}
        >
          {watched ? '✓' : '+'}
        </button>
      </div>
      <h3>{m.title}</h3>
      <p className="year">{m.year}{m.originalTitle ? ` · ${m.originalTitle}` : ''}</p>
      <p className="score-read" aria-live="polite">
        <strong>{shown ?? '–'}</strong>
        <span>{shown ? LABELS[shown - 1] : watched ? 'Sin puntaje' : 'Toca para puntuar'}</span>
      </p>
      <div className="scores" role="group" aria-label="Tu puntaje" ref={group} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`${score === n ? 'on' : ''} ${shown !== null && n <= shown ? 'fill' : ''}`}
            aria-pressed={score === n}
            aria-label={`Puntuar ${n} de 10: ${LABELS[n - 1]}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => rate(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {failed && <p className="error small">No se pudo guardar. Inténtalo de nuevo.</p>}
      <p className="community">
        {watchersCount === 0 ? 'Nadie aún' : `Vista por ${watchersCount}`}
        {r?.averageScore != null && <b>★ {r.averageScore.toFixed(1)}</b>}
      </p>
      {ratings.length > 0 && (
        <ul className="ratings" aria-label="Puntajes de tus amigos">
          {ratings.map((x) => (
            <li key={x.tag} className={`${x.tag === me ? 'me ' : ''}${tier(x.score)}`}>
              {x.tag} <b>{x.score ?? '✓'}</b>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
})
