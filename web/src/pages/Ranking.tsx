import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type RankingRow } from '../api'
import { RankingSkeleton } from '../components/Skeleton'

// Visual order of the podium: #2 left, #1 center, #3 right.
const PODIUM_ORDER = [1, 0, 2]

export default function Ranking() {
  const [rows, setRows] = useState<RankingRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => api.ranking().then(setRows)
    load().catch((e) => setError(e.message))
    // Background polls never reset `rows`, so no skeleton flashes.
    const poll = () => {
      if (document.visibilityState === 'visible') load().catch(() => {})
    }
    const id = setInterval(poll, 15000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!rows) return <RankingSkeleton />
  const rest = rows.slice(3)
  const max = Math.max(1, ...rows.map((r) => r.watchedCount))

  return (
    <>
      <h1 className="title">Ranking</h1>
      <p className="muted">Quién ha visto más.</p>

      {rows.length > 0 && (
        <ol className="podium" aria-label="Podio">
          {PODIUM_ORDER.map((i) => {
            const r = rows[i]
            if (!r) return <li key={i} className="pod pod-empty" aria-hidden="true" />
            return (
              <li key={r.tag} className={`pod pod-${i + 1}`}>
                <Link to={`/u/${r.tag}`} className="pod-who">{r.tag}</Link>
                <span className="pod-count"><b>{r.watchedCount}</b> {r.watchedCount === 1 ? 'vista' : 'vistas'}</span>
                <span className="pod-avg">{r.averageScore !== null ? `★ ${r.averageScore.toFixed(1)}` : '–'}</span>
                <div className="pod-step"><span className="pod-place">{i + 1}</span></div>
              </li>
            )
          })}
        </ol>
      )}

      {rest.length > 0 && (
        <ol className="ranking" start={4}>
          {rest.map((r, i) => (
            <li key={r.tag}>
              <span className="pos">{i + 4}</span>
              <Link to={`/u/${r.tag}`} className="who">{r.tag}</Link>
              <span className="bar"><i style={{ width: `${(r.watchedCount / max) * 100}%` }} /></span>
              <span className="count">{r.watchedCount} <small>{r.watchedCount === 1 ? 'vista' : 'vistas'}</small></span>
              <span className="avg">{r.averageScore !== null ? `★ ${r.averageScore.toFixed(1)}` : '–'}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
