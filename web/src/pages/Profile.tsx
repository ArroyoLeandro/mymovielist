import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, type ListEntry, type Profile as ProfileData, type TitleSummary } from '../api'
import { useAuth } from '../auth'
import Poster from '../components/Poster'
import StudioLogo from '../components/StudioLogo'
import { ProfileSkeleton } from '../components/Skeleton'
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
        {children}
      </div>
      {aside}
    </li>
  )
}

export default function Profile() {
  const { tag = '' } = useParams()
  const { user } = useAuth()
  const { data, error } = useProfile(tag)
  if (error && !data) return <p className="error">{error.message}</p>
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

  const received = data.recommendedToMe ?? []
  const sent = data.myRecommendations ?? []
  const tabs = ([
    ['vistas', 'Vistas', data.stats.watchedCount],
    ['pendientes', 'Pendientes', data.pending.length],
    ...(own ? [['recomendadas', 'Recomendadas', received.length], ['mis-recomendaciones', 'Mis recomendaciones', sent.reduce((n, g) => n + g.items.length, 0)]] : []),
  ] as [Tab, string, number][])
  const picked = params.get('tab')
  const tab = tabs.find((t) => t[0] === picked)?.[0] ?? 'vistas'
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
      <h1 className="title">{data.user.tag}<span className="muted-title"> · {own ? 'mi perfil' : 'lista de películas'}</span></h1>
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

      <div className="seg tabs profile-tabs" role="tablist" aria-label="Secciones del perfil">
        {tabs.map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {label} <small>{n}</small>
          </button>
        ))}
      </div>
      {failed && <p className="error small">No se pudo completar la acción. Inténtalo de nuevo.</p>}

      {tab === 'vistas' && (
        stats.watchedCount === 0 ? (
          <p className="muted tab-empty">Todavía no ha visto nada.</p>
        ) : (
          <>
            <div className="chips-bar profile-filters">
              <div className="chips-wrap">
                <nav className="chips" aria-label="Estudios">
                  <button className={studio === 'all' ? 'on' : ''} onClick={() => setStudio('all')}>Todos <small>{stats.watchedCount}</small></button>
                  {stats.byStudio.map((s) => (
                    <button key={s.slug} className={studio === s.slug ? 'on' : ''} onClick={() => setStudio(s.slug)}>
                      {s.name} <small>{s.watched}</small>
                    </button>
                  ))}
                </nav>
              </div>
            </div>
            <div className="filter-row">
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
                <option value="all">Todo</option>
                <option value="movie">Películas</option>
                <option value="series">Series</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar por">
                <option value="score">Puntaje</option>
                <option value="title">Título</option>
                <option value="year">Año</option>
                <option value="recent">Vistos recientemente</option>
              </select>
            </div>

            {groups.length === 0 && <p className="muted">No hay títulos con esos filtros.</p>}
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
                      <button className="era-toggle studio-head" aria-expanded={open} onClick={() => toggle(s.slug)}>
                        <i className={`chev ${open ? 'open' : ''}`} aria-hidden="true" />
                        <StudioLogo name={s.name} url={s.logoUrl} className="mini" />
                        {s.name}
                        <em>{s.watched} vistas{s.avgScore !== null ? ` · prom. ${s.avgScore.toFixed(1)}` : ''}</em>
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
          <p className="muted tab-empty">{own ? 'No tienes pendientes. Usa “Quiero verla” en cualquier título.' : 'No tiene pendientes.'}</p>
        ) : (
          <ul className="list tab-list">
            {data.pending.map((m) => (
              <TitleRow
                key={m.id}
                m={m}
                aside={own && (
                  <span className="row-actions">
                    <button className="mini-btn primary-ish" disabled={busy === m.id} onClick={() => void act(m.id, () => api.saveEntry(m.id, true, null))}>La vi</button>
                    <button className="mini-btn" disabled={busy === m.id} onClick={() => void act(m.id, () => api.setPending(m.id, false))}>Quitar</button>
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
          <p className="muted tab-empty">Nadie te ha recomendado nada todavía.</p>
        ) : (
          <ul className="list tab-list">
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
                          <button className="mini-btn" disabled={busy === r.id} onClick={() => void act(r.id, () => api.setPending(r.movie.id, true))}>Quiero verla</button>
                        )}
                        <button className="mini-btn primary-ish" disabled={busy === r.id} onClick={() => void act(r.id, () => api.saveEntry(r.movie.id, true, null))}>La vi</button>
                      </>
                    )}
                  </span>
                }
              >
                <span className="reco-from">de <b>@{r.from}</b> &middot; {fmtDate(r.createdAt)}</span>
                {r.note && <q className="reco-note">{r.note}</q>}
              </TitleRow>
            ))}
          </ul>
        )
      )}

      {tab === 'mis-recomendaciones' && own && (
        sent.length === 0 ? (
          <p className="muted tab-empty">Todavía no has recomendado nada. Usa “Recomendar…” en cualquier título.</p>
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
                          <button className="mini-btn" disabled={busy === i.id} onClick={() => void act(i.id, () => api.deleteRecommendation(i.id))} aria-label={`Eliminar la recomendación de ${i.movie.title} a @${g.toTag}`}>Eliminar</button>
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
