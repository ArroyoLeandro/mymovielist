import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type RankingRow } from '../api'

export default function Ranking() {
  const [rows, setRows] = useState<RankingRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.ranking().then(setRows).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!rows) return <p className="muted">Loading…</p>
  const max = Math.max(1, ...rows.map((r) => r.watchedCount))

  return (
    <>
      <h1 className="title">Ranking</h1>
      <p className="muted">Who has watched the most.</p>
      <ol className="ranking">
        {rows.map((r, i) => (
          <li key={r.tag} className={i < 3 ? `top top-${i + 1}` : ''}>
            <span className="pos">{i + 1}</span>
            <Link to={`/u/${r.tag}`} className="who">{r.tag}</Link>
            <span className="bar"><i style={{ width: `${(r.watchedCount / max) * 100}%` }} /></span>
            <span className="count">{r.watchedCount} <small>watched</small></span>
            <span className="avg">{r.averageScore !== null ? `★ ${r.averageScore.toFixed(1)}` : '–'}</span>
          </li>
        ))}
      </ol>
    </>
  )
}
