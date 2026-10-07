import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type UserList } from '../api'
import Poster from '../components/Poster'

export default function Profile() {
  const { tag = '' } = useParams()
  const [data, setData] = useState<UserList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    api.userList(tag).then(setData).catch((e) => setError(e.message))
  }, [tag])

  const entries = useMemo(
    () => [...(data?.entries ?? [])].sort(
      (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.movie.title.localeCompare(b.movie.title),
    ),
    [data],
  )

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { stats } = data
  const pct = stats.totalMovies ? Math.round((stats.watchedCount / stats.totalMovies) * 100) : 0
  const dist = Array.from({ length: 10 }, (_, i) => stats.scoreDistribution[String(i + 1)] ?? 0)
  const maxDist = Math.max(1, ...dist)

  return (
    <>
      <h1 className="title">{data.user.tag}<span className="muted-title">&rsquo;s movie list</span></h1>
      <section className="stats">
        <div className="stat"><b>{stats.watchedCount}<small>/{stats.totalMovies}</small></b><span>watched &middot; {pct}%</span></div>
        <div className="stat"><b>{stats.averageScore !== null ? stats.averageScore.toFixed(1) : '–'}</b><span>average score</span></div>
        <div className="dist" aria-label="Score distribution">
          {dist.map((n, i) => (
            <div key={i} className="dist-col" title={`${n} movie${n === 1 ? '' : 's'} scored ${i + 1}`}>
              <i style={{ height: `${(n / maxDist) * 100}%` }} />
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
      </section>

      {entries.length === 0 ? (
        <p className="muted">Nothing watched yet.</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.movie.id}>
              <Poster url={e.movie.posterUrl} title={e.movie.title} className="thumb" />
              <div className="info">
                <strong>{e.movie.title}</strong>
                <span className="muted">{e.movie.year}</span>
              </div>
              <span className={`score-pill ${e.score === null ? 'none' : ''}`}>{e.score ?? 'No score'}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
