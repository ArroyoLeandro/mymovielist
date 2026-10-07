import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type ListEntry, type UserList } from '../api'
import Poster from '../components/Poster'
import StudioLogo from '../components/StudioLogo'
import { ProfileSkeleton } from '../components/Skeleton'

type Sort = 'score' | 'title' | 'year' | 'recent'
type Kind = 'all' | 'movie' | 'series'

const SORTS: Record<Sort, (a: ListEntry, b: ListEntry) => number> = {
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.movie.title.localeCompare(b.movie.title),
  title: (a, b) => a.movie.title.localeCompare(b.movie.title),
  year: (a, b) => b.movie.year - a.movie.year || a.movie.title.localeCompare(b.movie.title),
  recent: (a, b) => b.watchedAt.localeCompare(a.watchedAt),
}

function Row({ e }: { e: ListEntry }) {
  const { movie: m } = e
  return (
    <li>
      <Poster url={m.posterUrl} title={m.title} className="thumb" />
      <div className="info">
        <strong>{m.title}</strong>
        <span className="muted">{m.year}</span>
        <span className="tags">
          <span className="tag studio">{m.studio.name}</span>
          <span className="tag">{m.section.name}</span>
          {m.mediaType === 'series' && <span className="tag series">Serie</span>}
        </span>
      </div>
      <span className={`score-pill ${e.score === null ? 'none' : ''}`}>{e.score ?? 'Sin puntaje'}</span>
    </li>
  )
}

export default function Profile() {
  const { tag = '' } = useParams()
  const [data, setData] = useState<UserList | null>(null)
  const [error, setError] = useState('')
  const [studio, setStudio] = useState('all')
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<Sort>('score')
  const [closed, setClosed] = useState<Set<string>>(new Set())

  useEffect(() => {
    setData(null)
    setError('')
    setStudio('all')
    api.userList(tag).then(setData).catch((e) => setError(e.message))
  }, [tag])

  const groups = useMemo(() => {
    if (!data) return []
    const list = data.entries.filter(
      (e) => (kind === 'all' || e.movie.mediaType === kind) && (studio === 'all' || e.movie.studio.slug === studio),
    )
    list.sort(SORTS[sort])
    return data.stats.byStudio
      .map((s) => ({ s, items: list.filter((e) => e.movie.studio.slug === s.slug) }))
      .filter((g) => g.items.length > 0)
  }, [data, studio, kind, sort])

  if (error) return <p className="error">{error}</p>
  if (!data) return <ProfileSkeleton />

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
      <h1 className="title">{data.user.tag}<span className="muted-title"> · lista de películas</span></h1>
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

      {stats.watchedCount === 0 ? (
        <p className="muted">Todavía no ha visto nada.</p>
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
            <ul className="list">{groups.flatMap((g) => g.items).map((e) => <Row key={e.movie.id} e={e} />)}</ul>
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
                  {open && <ul className="list">{items.map((e) => <Row key={e.movie.id} e={e} />)}</ul>}
                </section>
              )
            })
          )}
        </>
      )}
    </>
  )
}
