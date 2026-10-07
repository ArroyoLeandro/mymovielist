import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
  const editVersion = useRef(0) // bumped when a local edit starts and when it finishes
  const { user } = useAuth()

  const load = useCallback(() => api.catalog(slug).then(setData), [slug])

  // Like load, but drops the response if a local edit started/finished meanwhile or a save is pending.
  const refresh = useCallback(() => {
    const version = editVersion.current
    return api.catalog(slug).then((d) => {
      if (pending.current === 0 && editVersion.current === version) setData(d)
    })
  }, [slug])

  useEffect(() => {
    setData(null)
    setError('')
    load().catch((e) => setError(e.message))
  }, [load])

  // Background refresh; stale responses are discarded so optimistic edits are not clobbered.
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible' && pending.current === 0) refresh().catch(() => {})
    }
    const id = setInterval(poll, 8000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [refresh])

  const patch = (id: number, fn: (m: Movie) => Movie) =>
    setData((d) => d && { ...d, sections: d.sections.map((s) => ({ ...s, movies: s.movies.map((m) => (m.id === id ? fn(m) : m)) })) })

  const save = async (movie: Movie, watched: boolean, score: number | null) => {
    const delta = Number(watched) - Number(movie.watched)
    patch(movie.id, (m) => ({ ...m, watched, score, watchersCount: m.watchersCount + delta }))
    pending.current++
    editVersion.current++
    try {
      const entry = await api.saveEntry(movie.id, watched, score)
      // Server is the source of truth, unless a newer save for this session is still in flight.
      if (pending.current === 1) patch(movie.id, (m) => ({ ...m, watched: entry.watched, score: entry.score }))
      return true
    } catch {
      patch(movie.id, () => movie) // roll back
      return false
    } finally {
      // Refresh community stats once all in-flight saves are done.
      editVersion.current++
      if (--pending.current === 0) refresh().catch(() => {})
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

const LABELS = ['Awful', 'Bad', 'Poor', 'Meh', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Masterpiece']
const tier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')

function Card({ movie: m, me, onSave }: { movie: Movie; me?: string; onSave: (m: Movie, watched: boolean, score: number | null) => Promise<boolean> }) {
  const [hover, setHover] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const group = useRef<HTMLDivElement>(null)

  const rate = async (n: number) => {
    setHover(null)
    setFailed(false)
    if (!(await onSave(m, true, m.score === n ? null : n))) {
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
  const shown = hover ?? m.score
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
      <p className="score-read" aria-live="polite">
        <strong>{shown ?? '–'}</strong>
        <span>{shown ? LABELS[shown - 1] : m.watched ? 'No score yet' : 'Tap to rate'}</span>
      </p>
      <div className="scores" role="group" aria-label="Your score" ref={group} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`${m.score === n ? 'on' : ''} ${shown !== null && n <= shown ? 'fill' : ''}`}
            aria-pressed={m.score === n}
            aria-label={`Rate ${n} of 10: ${LABELS[n - 1]}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => rate(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {failed && <p className="error small">Could not save. Try again.</p>}
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
