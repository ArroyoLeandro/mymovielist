import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Catalog as CatalogData, type Movie } from '../api'
import { useAuth } from '../auth'
import Poster from '../components/Poster'

type Filter = 'all' | 'watched' | 'unwatched'
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Catalog() {
  const { slug = 'disney' } = useParams()
  const [data, setData] = useState<CatalogData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const pending = useRef(0)
  const { user } = useAuth()

  const load = useCallback(() => api.catalog(slug).then(setData), [slug])

  useEffect(() => {
    setData(null)
    setError('')
    load().catch((e) => setError(e.message))
  }, [load])

  // Background refresh; skipped while a save is in flight so optimistic edits are not clobbered.
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible' && pending.current === 0) load().catch(() => {})
    }
    const id = setInterval(poll, 8000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [load])

  const patch = (id: number, fn: (m: Movie) => Movie) =>
    setData((d) => d && { ...d, sections: d.sections.map((s) => ({ ...s, movies: s.movies.map((m) => (m.id === id ? fn(m) : m)) })) })

  const save = async (movie: Movie, watched: boolean, score: number | null) => {
    const delta = Number(watched) - Number(movie.watched)
    patch(movie.id, (m) => ({ ...m, watched, score, watchersCount: m.watchersCount + delta }))
    pending.current++
    try {
      await api.saveEntry(movie.id, watched, score)
    } catch {
      patch(movie.id, () => movie) // roll back
    } finally {
      // Refresh community stats once all in-flight saves are done.
      if (--pending.current === 0) load().catch(() => {})
    }
  }

  const all = useMemo(() => data?.sections.flatMap((s) => s.movies) ?? [], [data])
  const watchedCount = all.filter((m) => m.watched).length
  const pct = all.length ? Math.round((watchedCount / all.length) * 100) : 0

  const q = norm(query.trim())
  const visible = (m: Movie) =>
    (filter === 'all' || (filter === 'watched') === m.watched) &&
    (!q || norm(m.title).includes(q) || norm(m.originalTitle ?? '').includes(q))

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <>
      <div className="toolbar">
        <div className="progress">
          <div className="progress-text"><h1 className="title">{data.studio.name}</h1><span>{watchedCount}/{all.length} watched &middot; {pct}%</span></div>
          <div className="meter"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <input type="search" placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search by title" />
        <div className="seg" role="group" aria-label="Filter">
          {(['all', 'watched', 'unwatched'] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'watched' ? 'Watched' : 'Not watched'}
            </button>
          ))}
        </div>
      </div>

      {data.sections.map((s) => {
        const movies = s.movies.filter(visible)
        if (movies.length === 0) return null
        return (
          <section key={s.slug} className="era">
            <h2>{s.name} <span>{s.period}</span></h2>
            <div className="grid">
              {movies.map((m) => <Card key={m.id} movie={m} me={user?.tag} onSave={save} />)}
            </div>
          </section>
        )
      })}
      {all.filter(visible).length === 0 && <p className="muted">No movies match. Clear the search or change the filter.</p>}
    </>
  )
}

const tier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')

function Card({ movie: m, me, onSave }: { movie: Movie; me?: string; onSave: (m: Movie, watched: boolean, score: number | null) => void }) {
  return (
    <article className={`card ${m.watched ? 'seen' : ''}`}>
      <div className="art">
        <Poster url={m.posterUrl} title={m.title} />
        <button
          className={`check ${m.watched ? 'on' : ''}`}
          aria-pressed={m.watched}
          aria-label={m.watched ? `Unmark ${m.title} as watched` : `Mark ${m.title} as watched`}
          onClick={() => onSave(m, !m.watched, null)}
        >
          {m.watched ? '✓' : '+'}
        </button>
      </div>
      <h3>{m.title}</h3>
      <p className="year">{m.year}{m.originalTitle ? ` · ${m.originalTitle}` : ''}</p>
      <div className="scores" role="group" aria-label="Your score">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={!m.watched}
            className={m.score === n ? 'on' : ''}
            aria-pressed={m.score === n}
            onClick={() => onSave(m, true, m.score === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="community">
        {m.watchersCount === 0 ? 'Nobody yet' : `${m.watchersCount} watched`}
        {m.averageScore !== null && <b>★ {m.averageScore.toFixed(1)}</b>}
      </p>
      {m.ratings.length > 0 && (
        <ul className="ratings" aria-label="Friends' ratings">
          {m.ratings.map((r) => (
            <li key={r.tag} className={`${r.tag === me ? 'me ' : ''}${tier(r.score)}`}>
              {r.tag} <b>{r.score ?? '✓'}</b>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
