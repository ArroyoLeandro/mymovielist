import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, type ListEntry, type Profile as ProfileData, type Recommended, type TitleSummary } from '../api'
import { useAuth } from '../auth'
import Avatar from '../components/Avatar'
import Card from '../components/Card'
import ScoreChart from '../components/ScoreChart'
import { Bookmark, Eye, Inbox, Send, X } from 'lucide-react'
import { ProfileSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import { useTitleDetail } from '../components/TitleDetail'
import Tabs, { type TabItem } from '../components/Tabs'
import { blankRow, patchEntry } from '../lib/ratings'
import { patchTitle, settleAfterAction } from '../lib/titleCache'
import { toast } from '../lib/toast'
import { titleType } from '../lib/titleType'
import { useProfile } from '../queries'

type Sort = 'score' | 'title' | 'year' | 'recent'
type Kind = 'all' | 'movie' | 'series'
/** Vistas score filter: every score, an exact score 1..10, or the titles without a score. */
type ScorePick = 'all' | 'none' | number
const scoreMatches = (pick: ScorePick, s: number | null) => pick === 'all' || (pick === 'none' ? s === null : s === pick)
type Tab = 'vistas' | 'pendientes' | 'recomendadas' | 'mis-recomendaciones'
/** What an action did to a row in this visit: the row stays in place, marked, until the next visit. */
type Done = 'watched' | 'removed' | 'deleted'
/** Row key for `busy` / `done`: titles ("t:<movie id>") and sent recommendations ("r:<id>") never share one. */
type RowKey = `t:${number}` | `r:${number}`

const SORTS: Record<Sort, (a: ListEntry, b: ListEntry) => number> = {
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.movie.title.localeCompare(b.movie.title),
  title: (a, b) => a.movie.title.localeCompare(b.movie.title),
  year: (a, b) => b.movie.year - a.movie.year || a.movie.title.localeCompare(b.movie.title),
  recent: (a, b) => b.watchedAt.localeCompare(a.watchedAt),
}

/** How long the "Deshacer" action stays available after dismissing a recommendation. */
const UNDO_MS = 5000
/** Studio progress rows shown before "Ver todos". */
const STUDIOS_SHOWN = 5
/** Cards per chunk of a long flat grid: a multiple of every column count the grid uses (2 to 6), so rows stay full. */
const CHUNK = 60

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
/** Whole percent, but never "0%" for something that has started. */
const percent = (n: number, total: number) => {
  const p = total ? Math.round((n / total) * 100) : 0
  return p === 0 && n > 0 ? '<1%' : `${p}%`
}

/**
 * Opens the title modal in place (no navigation to the catalog). The profile payload has no per-user state, so the
 * title's row comes from its studio ratings (the same cache the studio page uses) before the modal opens.
 */
function useOpenTitle() {
  const qc = useQueryClient()
  const detail = useTitleDetail()
  const seq = useRef(0)
  return useCallback(async (m: TitleSummary) => {
    const token = ++seq.current
    try {
      const rows = await qc.fetchQuery({ queryKey: ['ratings', m.studio.slug], queryFn: () => api.ratings(m.studio.slug), staleTime: 30_000 })
      if (token !== seq.current) return // a later click won
      detail.openTitle({ ...m, state: rows.find((r) => r.movieId === m.id) ?? blankRow(m.id) })
    } catch {
      if (token === seq.current) toast({ tone: 'error', text: `No se pudo abrir “${m.title}”. Inténtalo de nuevo.` })
    }
  }, [qc, detail])
}

/**
 * One title in the profile, through the shared Card: poster (type badge, optional score pill) and title both open the
 * title modal; `meta` follows the year, `children` sit under it and `actions` are the card footer.
 */
function ProfileCard({ m, score, scoreLabel, meta, done = false, actions, children }: {
  m: TitleSummary; score?: number | null; scoreLabel?: string; meta?: string; done?: boolean; actions?: ReactNode; children?: ReactNode
}) {
  const openTitle = useOpenTitle()
  return (
    <Card
      className={`p-card ${done ? 'is-done' : ''}`}
      title={m.title}
      posterUrl={m.posterUrl}
      onOpen={() => void openTitle(m)}
      badge={titleType(m)}
      pill={score !== undefined && (
        <span className={`my-score ${score === null ? 'none' : ''}`} title={scoreLabel}>{score === null ? 'Sin puntaje' : `★ ${score}`}</span>
      )}
      meta={`${m.year}${meta ? ` · ${meta}` : ''}`}
      providers={m.providers}
      actions={actions}
    >
      {children}
    </Card>
  )
}

/**
 * One flat card grid. Long lists (hundreds of watched titles) are split into full-row chunks that the browser skips
 * rendering while they are off screen; they still read as a single grid.
 */
function CardGrid({ children }: { children: ReactNode[] }) {
  if (children.length <= CHUNK) return <div className="grid p-grid">{children}</div>
  const chunks: ReactNode[][] = []
  for (let i = 0; i < children.length; i += CHUNK) chunks.push(children.slice(i, i + CHUNK))
  return (
    <div className="p-chunks">
      {chunks.map((c, i) => <div key={i} className="grid p-grid era-body">{c}</div>)}
    </div>
  )
}

/**
 * Studio filter for the current tab: "Todos los estudios" plus every studio among `titles` (the tab's titles after the
 * type filter) with its count, most titles first. A picked studio with nothing in this tab stays listed with (0), so
 * switching tabs never silently drops the filter.
 */
function StudioSelect({ titles, value, names, onChange }: {
  titles: TitleSummary[]; value: string; names: Map<string, string>; onChange: (slug: string) => void
}) {
  const options = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>()
    for (const { studio: s } of titles) {
      const c = counts.get(s.slug)
      if (c) c.n++
      else counts.set(s.slug, { name: s.name, n: 1 })
    }
    if (value !== 'all' && !counts.has(value)) counts.set(value, { name: names.get(value) ?? value, n: 0 })
    return [...counts].sort(([, a], [, b]) => b.n - a.n || a.name.localeCompare(b.name, 'es'))
  }, [titles, value, names])
  return (
    <select className="p-studio" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Estudio">
      <option value="all">Todos los estudios ({titles.length})</option>
      {options.map(([slug, o]) => <option key={slug} value={slug}>{o.name} ({o.n})</option>)}
    </select>
  )
}

/**
 * Score filter for "Vistas": "Todos los puntajes", each exact score 10..1 with its count among `entries` (the watched
 * titles after the studio and type filters) and "Sin puntaje" when any watched title has no score. Scores with nothing
 * under the current filters stay listed with (0), so changing another filter never silently drops this one.
 */
function ScoreSelect({ entries, value, hasUnscored, onChange }: {
  entries: ListEntry[]; value: ScorePick; hasUnscored: boolean; onChange: (v: ScorePick) => void
}) {
  const counts = useMemo(() => {
    const c = new Map<number | null, number>()
    for (const e of entries) c.set(e.score, (c.get(e.score) ?? 0) + 1)
    return c
  }, [entries])
  const scores = Array.from({ length: 10 }, (_, i) => 10 - i)
  return (
    <select
      className="p-score"
      value={String(value)}
      onChange={(e) => onChange(e.target.value === 'all' || e.target.value === 'none' ? e.target.value : Number(e.target.value))}
      aria-label="Puntaje"
    >
      <option value="all">Todos los puntajes</option>
      {scores.map((n) => <option key={n} value={n}>★ {n} ({counts.get(n) ?? 0})</option>)}
      {(hasUnscored || value === 'none') && <option value="none">Sin puntaje ({counts.get(null) ?? 0})</option>}
    </select>
  )
}

type StudioStat = ProfileData['stats']['byStudio'][number]

/**
 * Progress per studio, secondary to the overview: dense rows (name, watched/total, percent, a thin bar) beside it.
 * Each row is also the studio filter: picking it filters "Vistas", picking it again clears it. Full names wrap (never
 * truncated); the top rows show first, the rest behind "Ver todos" in a list that scrolls inside the column.
 */
function StudioProgress({ studios, value, onPick }: { studios: StudioStat[]; value: string; onPick: (slug: string) => void }) {
  const [all, setAll] = useState(false)
  // Collapsed, a picked studio from the tail stays visible so the pressed row never disappears.
  const shown = all ? studios : studios.filter((s, i) => i < STUDIOS_SHOWN || s.slug === value)
  return (
    <section className="p-studios" aria-labelledby="sp-title">
      <div className="sp-head">
        <h2 id="sp-title">Progreso por estudio</h2>
        {value !== 'all' && <button type="button" className="btn btn-quiet btn-sm" onClick={() => onPick('all')}>Todos</button>}
      </div>
      <ul className={`sp-list ${all ? 'is-all' : ''}`}>
        {shown.map((s) => (
          <li key={s.slug}>
            <button
              type="button"
              className="sp-row"
              aria-pressed={value === s.slug}
              aria-label={`${s.name}: ${s.watched} de ${s.total} vistas, ${percent(s.watched, s.total)}. Ver solo este estudio`}
              onClick={() => onPick(value === s.slug ? 'all' : s.slug)}
            >
              <span className="sp-name">{s.name}</span>
              <span className="sp-n"><b>{s.watched}</b>/{s.total} <em>{percent(s.watched, s.total)}</em></span>
              <span className="sp-track" aria-hidden="true"><i style={{ width: `${s.total ? (s.watched / s.total) * 100 : 0}%` }} /></span>
            </button>
          </li>
        ))}
      </ul>
      {studios.length > STUDIOS_SHOWN && (
        <button type="button" className="btn btn-quiet btn-sm sp-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>
          {all ? 'Ver menos' : `Ver todos (${studios.length})`}
        </button>
      )}
    </section>
  )
}

export default function Profile() {
  const { tag = '' } = useParams()
  const { user } = useAuth()
  const { data, error, refetch } = useProfile(tag)
  if (error && !data) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!data) return <ProfileSkeleton />
  // Remount per profile: filters start fresh.
  return <ProfileView key={tag} data={data} own={user?.tag.toLowerCase() === tag.toLowerCase()} />
}

function ProfileView({ data, own }: { data: ProfileData; own: boolean }) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const [studio, setStudio] = useState('all')
  const [kind, setKind] = useState<Kind>('all')
  const [score, setScore] = useState<ScorePick>('all')
  const [sort, setSort] = useState<Sort>('score')
  const listTop = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<RowKey | null>(null)
  const [failed, setFailed] = useState(false)
  // Received recommendations dismissed in this session: hidden right away (optimistic), restored on undo or failure.
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [undo, setUndo] = useState<{ ids: number[]; text: string } | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  const dismissing = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  // Received recommendations, one row per title (several friends can recommend the same one), newest first.
  const received = useMemo(() => {
    const byTitle = new Map<number, { movie: TitleSummary; recos: Recommended[] }>()
    for (const r of data.recommendedToMe ?? []) {
      if (hidden.has(r.id)) continue
      const g = byTitle.get(r.movie.id)
      if (g) g.recos.push(r)
      else byTitle.set(r.movie.id, { movie: r.movie, recos: [r] })
    }
    return [...byTitle.values()].map((g) => ({ ...g, ids: g.recos.map((r) => r.id), watched: g.recos[0].watched, pending: g.recos[0].pending }))
  }, [data.recommendedToMe, hidden])
  const sent = data.myRecommendations ?? []
  const tabs: TabItem<Tab>[] = [
    { id: 'vistas', label: 'Vistas', count: data.stats.watchedCount },
    { id: 'pendientes', label: 'Pendientes', count: data.pending.length },
    ...(own
      ? [
          { id: 'recomendadas' as Tab, label: 'Recomendadas', count: received.length },
          { id: 'mis-recomendaciones' as Tab, label: 'Mis recomendaciones', count: sent.reduce((n, g) => n + g.items.length, 0) },
        ]
      : []),
  ]
  const picked = params.get('tab')
  const tab = tabs.find((t) => t.id === picked)?.id ?? 'vistas'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params)
    if (t === 'vistas') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  // Rows acted upon in this visit (keyed like `busy`): they stay where they are, marked, until the next visit.
  const [done, setDone] = useState<Map<RowKey, Done>>(new Map())
  // Runs a mutation; the lists are not refetched now (nothing moves under the user), only on their next visit.
  const act = async (key: RowKey, fn: () => Promise<unknown>, outcome?: Done) => {
    setBusy(key)
    setFailed(false)
    try {
      await fn()
      if (outcome) setDone((d) => new Map(d).set(key, outcome))
      settleAfterAction(qc)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }
  // Own profile only, so the viewer is this profile's user. Patches the title's state in every cached list.
  const markWatched = (id: number) => async () => {
    const e = await api.saveEntry(id, true, null)
    patchTitle(qc, id, (row) => patchEntry(row, data.user.tag, e.watched, e.score))
  }
  const setPending = (id: number, pending: boolean) => async () => {
    await api.setPending(id, pending)
    patchTitle(qc, id, (row) => ({ ...row, pending }))
  }

  const refresh = async () => settleAfterAction(qc)
  const setHiddenIds = (ids: number[], on: boolean) =>
    setHidden((h) => {
      const n = new Set(h)
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)))
      return n
    })

  // Dismiss for the recipient only: the sender keeps it in "Mis recomendaciones". Undo stays available for UNDO_MS.
  const dismiss = (ids: number[], text: string) => {
    setFailed(false)
    setHiddenIds(ids, true)
    setUndo({ ids, text })
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS)
    const run = Promise.all(ids.map((id) => api.dismissRecommendation(id, true)))
    dismissing.current = run.catch(() => undefined)
    run.then(refresh, () => {
      setHiddenIds(ids, false)
      setUndo(null)
      setFailed(true)
    })
  }

  const undoDismiss = async () => {
    if (!undo) return
    const { ids } = undo
    window.clearTimeout(undoTimer.current)
    setUndo(null)
    try {
      await dismissing.current // never let the undo overtake the dismiss it reverts
      await Promise.all(ids.map((id) => api.dismissRecommendation(id, false)))
      await refresh()
      setHiddenIds(ids, false)
    } catch {
      setFailed(true)
    }
  }

  // Studio and type filters are shared by every tab. Each tab's studio select counts its own titles of the picked type.
  const ofKind = (m: TitleSummary) => kind === 'all' || m.mediaType === kind
  const inStudio = (m: TitleSummary) => studio === 'all' || m.studio.slug === studio
  // Studio names from every list, so a picked studio keeps its name in a tab that has none of its titles.
  const studioNames = useMemo(() => {
    const names = new Map(data.stats.byStudio.map((s) => [s.slug, s.name]))
    const add = (m: TitleSummary) => names.set(m.studio.slug, m.studio.name)
    data.watched.forEach((e) => add(e.movie))
    data.pending.forEach(add)
    data.recommendedToMe?.forEach((r) => add(r.movie))
    data.myRecommendations?.forEach((g) => g.items.forEach((i) => add(i.movie)))
    return names
  }, [data])

  // Vistas filters are faceted: each select counts the titles that pass every other filter.
  const watchedTitles = useMemo(
    () => data.watched.filter((e) => (kind === 'all' || e.movie.mediaType === kind) && scoreMatches(score, e.score)).map((e) => e.movie),
    [data.watched, kind, score],
  )
  const watchedForScore = useMemo(
    () => data.watched.filter((e) => (kind === 'all' || e.movie.mediaType === kind) && (studio === 'all' || e.movie.studio.slug === studio)),
    [data.watched, kind, studio],
  )
  const watched = useMemo(
    () => watchedForScore.filter((e) => scoreMatches(score, e.score)).sort(SORTS[sort]),
    [watchedForScore, score, sort],
  )
  const hasUnscored = useMemo(() => data.watched.some((e) => e.score === null), [data.watched])
  const pendingTitles = data.pending.filter(ofKind)
  const pending = pendingTitles.filter(inStudio)
  const receivedTitles = received.map((g) => g.movie).filter(ofKind)
  const receivedShown = received.filter((g) => ofKind(g.movie) && inStudio(g.movie))
  // "Quitar las que ya vi" acts on what is on screen: the seen ones under the current filters.
  const receivedSeen = receivedShown.filter((g) => g.watched)
  const sentTitles = sent.flatMap((g) => g.items.map((i) => i.movie)).filter(ofKind)
  const sentShown = sent
    .map((g) => ({ ...g, items: g.items.filter((i) => ofKind(i.movie) && inStudio(i.movie)) }))
    .filter((g) => g.items.length > 0)

  const filterBar = (titles: TitleSummary[], sortable = false) => (
    <div className="profile-filters">
      <div className="filters">
        <StudioSelect titles={titles} value={studio} names={studioNames} onChange={setStudio} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
          <option value="all">Películas y series</option>
          <option value="movie">Películas</option>
          <option value="series">Series</option>
        </select>
        {sortable && <ScoreSelect entries={watchedForScore} value={score} hasUnscored={hasUnscored} onChange={setScore} />}
        {sortable && (
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por">
            <option value="score">Por puntaje</option>
            <option value="title">Por título</option>
            <option value="year">Por año</option>
            <option value="recent">Vistos recientemente</option>
          </select>
        )}
      </div>
    </div>
  )
  const noMatch = <p className="muted">No hay títulos con estos filtros.</p>

  const { stats } = data
  const pct = stats.totalMovies ? Math.round((stats.watchedCount / stats.totalMovies) * 100) : 0
  // Picking a studio or a score filters "Vistas" and brings the list into view when it is below the fold.
  const showVistas = () => {
    setTab('vistas')
    const top = listTop.current
    if (top && top.getBoundingClientRect().top > window.innerHeight * 0.6) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      top.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    }
  }
  const pickStudio = (slug: string) => {
    setStudio(slug)
    if (slug !== 'all') showVistas()
  }
  // A chart bar toggles its score: picking the selected one again clears the filter.
  const pickScore = (n: number) => {
    if (score === n) return setScore('all')
    setScore(n)
    showVistas()
  }
  const scoreLabel = own ? 'Tu puntaje' : `Puntaje de @${data.user.tag}`
  const dist = Array.from({ length: 10 }, (_, i) => stats.scoreDistribution[String(i + 1)] ?? 0)

  return (
    <>
      <header className="page-head profile-head">
        <Avatar tag={data.user.tag} className="profile-av" />
        <div className="profile-who">
          <h1 className="title">{data.user.tag}</h1>
          <p className="lead">{own ? 'Tu perfil: lo que viste, lo que tienes pendiente y lo que te recomendaron.' : 'Lo que vio y lo que tiene pendiente.'}</p>
        </div>
      </header>
      <div className={`ov-band ${stats.byStudio.length > 0 ? 'has-studios' : ''}`}>
        <section className="overview" aria-label="Resumen">
          <div className="ov-summary">
            <div className="ov-figure">
              <b>{stats.watchedCount}<small>/{stats.totalMovies}</small></b>
              <span>vistas</span>
              <span className="ov-meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
              <span className="ov-pct">{percent(stats.watchedCount, stats.totalMovies)} del catálogo</span>
            </div>
            <div className="ov-figure">
              <b>{stats.averageScore !== null ? stats.averageScore.toFixed(1) : '–'}</b>
              <span>puntaje promedio</span>
            </div>
          </div>
          <ScoreChart counts={dist} average={stats.averageScore} selected={typeof score === 'number' ? score : null} onPick={pickScore} />
        </section>
        {stats.byStudio.length > 0 && <StudioProgress studios={stats.byStudio} value={studio} onPick={pickStudio} />}
      </div>

      <div ref={listTop} className="profile-anchor" />
      <Tabs label="Secciones del perfil" items={tabs} value={tab} onChange={setTab} className="profile-tabs" />
      {failed && <p className="error small" role="alert">No se pudo completar la acción. Inténtalo de nuevo.</p>}
      <div role="status">
        {undo && (
          <div className="undo-toast">
            <span>{undo.text}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void undoDismiss()}>Deshacer</button>
          </div>
        )}
      </div>

      {tab === 'vistas' && (
        stats.watchedCount === 0 ? (
          <EmptyState icon={Eye} title={own ? 'Todavía no marcaste nada como visto' : `@${data.user.tag} todavía no marcó nada como visto`}>
            {own && <>Entra a un estudio y toca <b>+</b> en los títulos que ya viste.</>}
          </EmptyState>
        ) : (
          <>
            {filterBar(watchedTitles, true)}
            {watched.length === 0 ? noMatch : (
              <CardGrid>
                {watched.map((e) => <ProfileCard key={e.movie.id} m={e.movie} meta={e.movie.studio.name} score={e.score} scoreLabel={scoreLabel} />)}
              </CardGrid>
            )}
          </>
        )
      )}

      {tab === 'pendientes' && (
        data.pending.length === 0 ? (
          <EmptyState icon={Bookmark} title={own ? 'No tienes pendientes' : `@${data.user.tag} no tiene pendientes`}>
            {own && 'Toca el marcador en cualquier título para guardarlo aquí y verlo después.'}
          </EmptyState>
        ) : (
          <>
          {filterBar(pendingTitles)}
          {pending.length === 0 ? noMatch : (
          <CardGrid>
            {pending.map((m) => (
              <ProfileCard
                key={m.id}
                m={m}
                meta={m.studio.name}
                done={done.has(`t:${m.id}`)}
                actions={own && (
                  <>
                    {done.get(`t:${m.id}`) === 'watched' ? (
                      <span className="tag ok">Vista ✓</span>
                    ) : done.get(`t:${m.id}`) === 'removed' ? (
                      <span className="tag muted-tag">Quitada de pendientes</span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === `t:${m.id}`} onClick={() => void act(`t:${m.id}`, markWatched(m.id), 'watched')}>La vi</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `t:${m.id}`} onClick={() => void act(`t:${m.id}`, setPending(m.id, false), 'removed')}>Quitar</button>
                      </>
                    )}
                  </>
                )}
              >
                <span className="muted small-note">Agregada el {fmtDate(m.addedAt)}</span>
              </ProfileCard>
            ))}
          </CardGrid>
          )}
          </>
        )
      )}

      {tab === 'recomendadas' && own && (
        received.length === 0 ? (
          hidden.size > 0 ? (
            <EmptyState icon={Inbox} title="No te quedan recomendaciones">
              Las que quitaste ya no aparecen aquí; quien te las mandó las sigue viendo.
            </EmptyState>
          ) : (
            <EmptyState icon={Inbox} title="Todavía nadie te recomendó nada">
              Cuando alguien del grupo te recomiende un título, va a aparecer aquí.
            </EmptyState>
          )
        ) : (
          <>
          {filterBar(receivedTitles)}
          {receivedSeen.length > 0 && (
            <div className="reco-tools">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => dismiss(
                  receivedSeen.flatMap((g) => g.ids),
                  receivedSeen.length === 1 ? 'Quitaste 1 recomendación que ya viste.' : `Quitaste ${receivedSeen.length} recomendaciones que ya viste.`,
                )}
              >
                Quitar las que ya vi ({receivedSeen.length})
              </button>
            </div>
          )}
          {receivedShown.length === 0 ? noMatch : (
          <CardGrid>
            {receivedShown.map((g) => (
              <ProfileCard
                key={g.movie.id}
                m={g.movie}
                meta={g.movie.studio.name}
                actions={
                  <>
                    {g.watched ? (
                      <span className="tag ok">Ya la viste ✓</span>
                    ) : (
                      <>
                        {g.pending ? (
                          <span className="tag">En pendientes</span>
                        ) : (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `t:${g.movie.id}`} onClick={() => void act(`t:${g.movie.id}`, setPending(g.movie.id, true))}>Quiero verla</button>
                        )}
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === `t:${g.movie.id}`} onClick={() => void act(`t:${g.movie.id}`, markWatched(g.movie.id))}>La vi</button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm reco-dismiss"
                      title="Quitar de mis recomendaciones"
                      aria-label={`Quitar ${g.movie.title} (de ${g.recos.map((r) => `@${r.from}`).join(', ')}) de mis recomendaciones`}
                      disabled={busy === `t:${g.movie.id}`}
                      onClick={() => dismiss(g.ids, `Quitaste «${g.movie.title}» de tus recomendaciones.`)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </>
                }
              >
                <span className="reco-from">
                  de {g.recos.map((r, i) => <Fragment key={r.id}>{i > 0 && ', '}<b>@{r.from}</b></Fragment>)} &middot; {fmtDate(g.recos[0].createdAt)}
                </span>
                {g.recos.filter((r) => r.note).map((r) => (
                  <q key={r.id} className="reco-note">{g.recos.length > 1 && <b>@{r.from}: </b>}{r.note}</q>
                ))}
              </ProfileCard>
            ))}
          </CardGrid>
          )}
          </>
        )
      )}

      {tab === 'mis-recomendaciones' && own && (
        sent.length === 0 ? (
          <EmptyState icon={Send} title="Todavía no recomendaste nada">
            Toca el avión de papel en cualquier título para recomendárselo a alguien del grupo.
          </EmptyState>
        ) : (
          <>
          {filterBar(sentTitles)}
          {sentShown.length === 0 && noMatch}
          {sentShown.map((g) => {
            const seen = g.items.filter((i) => i.watched).length
            return (
              <section key={g.toTag} className="era">
                <h2><span className="reco-head">@{g.toTag}<em>{g.items.length} {g.items.length === 1 ? 'recomendación' : 'recomendaciones'} · {seen} {seen === 1 ? 'vista' : 'vistas'}</em></span></h2>
                <CardGrid>
                  {g.items.map((i) => (
                    <ProfileCard
                      key={i.id}
                      m={i.movie}
                      meta={i.movie.studio.name}
                      done={done.has(`r:${i.id}`)}
                      actions={
                        <>
                          {i.watched ? (
                            <span className="tag ok">La vio ✓{i.score !== null ? ` (${i.score})` : ''}</span>
                          ) : (
                            <span className="tag">Pendiente</span>
                          )}
                          {i.dismissed && <span className="tag muted-tag" title={`@${g.toTag} la quitó de sus recomendaciones`}>Descartada</span>}
                          {done.get(`r:${i.id}`) === 'deleted' ? (
                            <span className="tag muted-tag">Eliminada</span>
                          ) : (
                            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `r:${i.id}`} onClick={() => void act(`r:${i.id}`, () => api.deleteRecommendation(i.id), 'deleted')} aria-label={`Eliminar la recomendación de ${i.movie.title} a @${g.toTag}`}>Eliminar</button>
                          )}
                        </>
                      }
                    >
                      <span className="small-note muted">{fmtDate(i.createdAt)}</span>
                      {i.note && <q className="reco-note">{i.note}</q>}
                    </ProfileCard>
                  ))}
                </CardGrid>
              </section>
            )
          })}
          </>
        )
      )}
    </>
  )
}
