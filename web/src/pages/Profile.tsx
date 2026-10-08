import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, type ListEntry, type Profile as ProfileData, type Recommended, type TitleSummary } from '../api'
import { useAuth } from '../auth'
import { ProviderStrip } from '../components/Providers'
import Poster from '../components/Poster'
import StudioLogo from '../components/StudioLogo'
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

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

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

/** One title row: thumb, title (both open the title modal), tags, plus whatever the tab needs on the right and below. */
function TitleRow({ m, aside, done = false, children }: { m: TitleSummary; aside?: ReactNode; done?: boolean; children?: ReactNode }) {
  const type = titleType(m)
  const openTitle = useOpenTitle()
  return (
    <li className={done ? 'is-done' : undefined}>
      <button type="button" className="thumb-btn" tabIndex={-1} aria-hidden="true" onClick={() => void openTitle(m)}>
        <Poster url={m.posterUrl} title={m.title} className="thumb" />
      </button>
      <div className="info">
        <button type="button" className="row-title" onClick={() => void openTitle(m)}>{m.title}</button>
        <span className="muted">{m.year}</span>
        <span className="tags">
          <span className="tag studio">{m.studio.name}</span>
          <span className="tag">{m.section.name}</span>
          {type && <span className={`tag ${type.kind}`}>{type.label}</span>}
        </span>
        {m.providers?.length > 0 && <ProviderStrip refs={m.providers} />}
        {children}
      </div>
      {aside}
    </li>
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
  const [sort, setSort] = useState<Sort>('score')
  const [closed, setClosed] = useState<Set<string>>(new Set())
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
  const receivedSeen = received.filter((g) => g.watched)
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

  const groups = useMemo(() => {
    const list = data.watched.filter(
      (e) => (kind === 'all' || e.movie.mediaType === kind) && (studio === 'all' || e.movie.studio.slug === studio),
    )
    list.sort(SORTS[sort])
    return data.stats.byStudio
      .map((s) => ({ s, items: list.filter((e) => e.movie.studio.slug === s.slug) }))
      .filter((g) => g.items.length > 0)
  }, [data, studio, kind, sort])

  const { stats } = data
  const pct = stats.totalMovies ? Math.round((stats.watchedCount / stats.totalMovies) * 100) : 0
  const dist = Array.from({ length: 10 }, (_, i) => stats.scoreDistribution[String(i + 1)] ?? 0)
  const maxDist = Math.max(1, ...dist)
  const toggle = (slug: string) =>
    setClosed((c) => {
      const n = new Set(c)
      if (!n.delete(slug)) n.add(slug)
      return n
    })

  return (
    <>
      <header className="page-head">
        <h1 className="title">{data.user.tag}</h1>
        <p className="lead">{own ? 'Tu perfil: lo que viste, lo que tienes pendiente y lo que te recomendaron.' : 'Lo que vio y lo que tiene pendiente.'}</p>
      </header>
      <section className="stats">
        <div className="stat"><b>{stats.watchedCount}<small>/{stats.totalMovies}</small></b><span>vistas &middot; {pct}%</span></div>
        <div className="stat"><b>{stats.averageScore !== null ? stats.averageScore.toFixed(1) : '–'}</b><span>puntaje promedio</span></div>
        <div className="dist" aria-label="Distribución de puntajes">
          {dist.map((n, i) => (
            <div key={i} className="dist-col" title={`${n} ${n === 1 ? 'título' : 'títulos'} con puntaje ${i + 1}`}>
              <i style={{ height: `${(n / maxDist) * 100}%` }} />
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
        {stats.byStudio.length > 0 && (
          <div className="studio-bars">
            {stats.byStudio.map((s) => (
              <div key={s.slug} className="sbar" title={`${s.name}: ${s.watched} de ${s.total}`}>
                <span className="sbar-name">{s.name}</span>
                <div className="sbar-track"><i style={{ width: `${s.total ? (s.watched / s.total) * 100 : 0}%` }} /></div>
                <span className="sbar-n">{s.watched}/{s.total}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
            <div className="profile-filters">
              <div className="chip-list" role="group" aria-label="Filtrar por estudio">
                <button type="button" className={`chip ${studio === 'all' ? 'on' : ''}`} aria-pressed={studio === 'all'} onClick={() => setStudio('all')}>Todos <small>{stats.watchedCount}</small></button>
                {stats.byStudio.map((s) => (
                  <button key={s.slug} type="button" className={`chip ${studio === s.slug ? 'on' : ''}`} aria-pressed={studio === s.slug} onClick={() => setStudio(s.slug)}>
                    {s.name} <small>{s.watched}</small>
                  </button>
                ))}
              </div>
              <div className="filters">
                <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
                  <option value="all">Películas y series</option>
                  <option value="movie">Películas</option>
                  <option value="series">Series</option>
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por">
                  <option value="score">Por puntaje</option>
                  <option value="title">Por título</option>
                  <option value="year">Por año</option>
                  <option value="recent">Vistos recientemente</option>
                </select>
              </div>
            </div>

            {groups.length === 0 && <p className="muted">No hay títulos con estos filtros.</p>}
            {studio !== 'all' ? (
              <ul className="list">
                {groups.flatMap((g) => g.items).map((e) => (
                  <TitleRow key={e.movie.id} m={e.movie} aside={<span className={`score-pill ${e.score === null ? 'none' : ''}`}>{e.score ?? 'Sin puntaje'}</span>} />
                ))}
              </ul>
            ) : (
              groups.map(({ s, items }) => {
                const open = !closed.has(s.slug)
                return (
                  <section key={s.slug} className="era">
                    <h2>
                      <button type="button" className="era-toggle" aria-expanded={open} onClick={() => toggle(s.slug)}>
                        <i className={`chev ${open ? 'open' : ''}`} aria-hidden="true" />
                        <StudioLogo name={s.name} url={s.logoUrl} className="mini" />
                        {s.name}
                        <em>{s.watched} {s.watched === 1 ? 'vista' : 'vistas'}{s.avgScore !== null ? ` · prom. ${s.avgScore.toFixed(1)}` : ''}</em>
                      </button>
                    </h2>
                    {open && (
                      <ul className="list">
                        {items.map((e) => (
                          <TitleRow key={e.movie.id} m={e.movie} aside={<span className={`score-pill ${e.score === null ? 'none' : ''}`}>{e.score ?? 'Sin puntaje'}</span>} />
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })
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
          <ul className="list">
            {data.pending.map((m) => (
              <TitleRow
                key={m.id}
                m={m}
                done={done.has(`t:${m.id}`)}
                aside={own && (
                  <span className="row-actions">
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
                  </span>
                )}
              >
                <span className="muted small-note">Agregada el {fmtDate(m.addedAt)}</span>
              </TitleRow>
            ))}
          </ul>
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
          <ul className="list">
            {received.map((g) => (
              <TitleRow
                key={g.movie.id}
                m={g.movie}
                aside={
                  <span className="row-actions">
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
                  </span>
                }
              >
                <span className="reco-from">
                  de {g.recos.map((r, i) => <Fragment key={r.id}>{i > 0 && ', '}<b>@{r.from}</b></Fragment>)} &middot; {fmtDate(g.recos[0].createdAt)}
                </span>
                {g.recos.filter((r) => r.note).map((r) => (
                  <q key={r.id} className="reco-note">{g.recos.length > 1 && <b>@{r.from}: </b>}{r.note}</q>
                ))}
              </TitleRow>
            ))}
          </ul>
          </>
        )
      )}

      {tab === 'mis-recomendaciones' && own && (
        sent.length === 0 ? (
          <EmptyState icon={Send} title="Todavía no recomendaste nada">
            Toca el avión de papel en cualquier título para recomendárselo a alguien del grupo.
          </EmptyState>
        ) : (
          sent.map((g) => {
            const seen = g.items.filter((i) => i.watched).length
            return (
              <section key={g.toTag} className="era">
                <h2><span className="reco-head">@{g.toTag}<em>{g.items.length} {g.items.length === 1 ? 'recomendación' : 'recomendaciones'} · {seen} {seen === 1 ? 'vista' : 'vistas'}</em></span></h2>
                <ul className="list">
                  {g.items.map((i) => (
                    <TitleRow
                      key={i.id}
                      m={i.movie}
                      done={done.has(`r:${i.id}`)}
                      aside={
                        <span className="row-actions">
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
                        </span>
                      }
                    >
                      <span className="small-note muted">{fmtDate(i.createdAt)}</span>
                      {i.note && <q className="reco-note">{i.note}</q>}
                    </TitleRow>
                  ))}
                </ul>
              </section>
            )
          })
        )
      )}
    </>
  )
}
