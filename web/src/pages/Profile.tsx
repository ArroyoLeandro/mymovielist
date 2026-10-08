import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, type ListEntry, type Profile as ProfileData, type TitleSummary } from '../api'
import { useAuth } from '../auth'
import { ProviderStrip } from '../components/Providers'
import Poster from '../components/Poster'
import StudioLogo from '../components/StudioLogo'
import { Bookmark, Eye, Inbox, Send, X } from 'lucide-react'
import { ProfileSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import Tabs, { type TabItem } from '../components/Tabs'
import { DYNAMIC_KEYS, useProfile } from '../queries'

type Sort = 'score' | 'title' | 'year' | 'recent'
type Kind = 'all' | 'movie' | 'series'
type Tab = 'vistas' | 'pendientes' | 'recomendadas' | 'mis-recomendaciones'

const SORTS: Record<Sort, (a: ListEntry, b: ListEntry) => number> = {
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.movie.title.localeCompare(b.movie.title),
  title: (a, b) => a.movie.title.localeCompare(b.movie.title),
  year: (a, b) => b.movie.year - a.movie.year || a.movie.title.localeCompare(b.movie.title),
  recent: (a, b) => b.watchedAt.localeCompare(a.watchedAt),
}

/** How long the "Deshacer" action stays available after dismissing a recommendation. */
const UNDO_MS = 5000

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })

/** One title row: thumb, linked title, tags, plus whatever the tab needs on the right and below. */
function TitleRow({ m, aside, children }: { m: TitleSummary; aside?: ReactNode; children?: ReactNode }) {
  return (
    <li>
      <Poster url={m.posterUrl} title={m.title} className="thumb" />
      <div className="info">
        <Link to={`/studio/${m.studio.slug}?t=${m.id}`} className="row-title">{m.title}</Link>
        <span className="muted">{m.year}</span>
        <span className="tags">
          <span className="tag studio">{m.studio.name}</span>
          <span className="tag">{m.section.name}</span>
          {m.mediaType === 'series' && <span className="tag series">Serie</span>}
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
  const [busy, setBusy] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  // Received recommendations dismissed in this session: hidden right away (optimistic), restored on undo or failure.
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [undo, setUndo] = useState<{ ids: number[]; text: string } | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)
  const dismissing = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  const received = (data.recommendedToMe ?? []).filter((r) => !hidden.has(r.id))
  const receivedSeen = received.filter((r) => r.watched)
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

  // Runs a mutation, then refreshes every query holding per-user title state (including this profile).
  const act = async (key: number, fn: () => Promise<unknown>) => {
    setBusy(key)
    setFailed(false)
    try {
      await fn()
      await Promise.all(DYNAMIC_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })))
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const refresh = () => Promise.all(DYNAMIC_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })))
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
                aside={own && (
                  <span className="row-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy === m.id} onClick={() => void act(m.id, () => api.saveEntry(m.id, true, null))}>La vi</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === m.id} onClick={() => void act(m.id, () => api.setPending(m.id, false))}>Quitar</button>
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
                  receivedSeen.map((r) => r.id),
                  receivedSeen.length === 1 ? 'Quitaste 1 recomendación que ya viste.' : `Quitaste ${receivedSeen.length} recomendaciones que ya viste.`,
                )}
              >
                Quitar las que ya vi ({receivedSeen.length})
              </button>
            </div>
          )}
          <ul className="list">
            {received.map((r) => (
              <TitleRow
                key={r.id}
                m={r.movie}
                aside={
                  <span className="row-actions">
                    {r.watched ? (
                      <span className="tag ok">Ya la viste ✓</span>
                    ) : (
                      <>
                        {r.pending ? (
                          <span className="tag">En pendientes</span>
                        ) : (
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => void act(r.id, () => api.setPending(r.movie.id, true))}>Quiero verla</button>
                        )}
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => void act(r.id, () => api.saveEntry(r.movie.id, true, null))}>La vi</button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm reco-dismiss"
                      title="Quitar de mis recomendaciones"
                      aria-label={`Quitar ${r.movie.title} (de @${r.from}) de mis recomendaciones`}
                      disabled={busy === r.id}
                      onClick={() => dismiss([r.id], `Quitaste «${r.movie.title}» de tus recomendaciones.`)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </span>
                }
              >
                <span className="reco-from">de <b>@{r.from}</b> &middot; {fmtDate(r.createdAt)}</span>
                {r.note && <q className="reco-note">{r.note}</q>}
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
                      aside={
                        <span className="row-actions">
                          {i.watched ? (
                            <span className="tag ok">La vio ✓{i.score !== null ? ` (${i.score})` : ''}</span>
                          ) : (
                            <span className="tag">Pendiente</span>
                          )}
                          {i.dismissed && <span className="tag muted-tag" title={`@${g.toTag} la quitó de sus recomendaciones`}>Descartada</span>}
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === i.id} onClick={() => void act(i.id, () => api.deleteRecommendation(i.id))} aria-label={`Eliminar la recomendación de ${i.movie.title} a @${g.toTag}`}>Eliminar</button>
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
