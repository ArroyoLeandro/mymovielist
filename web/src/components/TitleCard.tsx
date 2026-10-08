import { memo, useRef, useState, type KeyboardEvent } from 'react'
import type { RatingRow, TitleSummary } from '../api'
import Poster from './Poster'
import RecommendModal from './RecommendModal'

export type SaveFn = (movieId: number, watched: boolean, score: number | null) => Promise<boolean>
export type PendingFn = (movieId: number, pending: boolean) => Promise<boolean>
export type CardMovie = Pick<TitleSummary, 'id' | 'title' | 'originalTitle' | 'year' | 'posterUrl' | 'mediaType'>

const LABELS = ['Horrible', 'Malo', 'Flojo', 'Regular', 'Pasable', 'Decente', 'Bueno', 'Muy bueno', 'Excelente', 'Obra maestra']
const tier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')

/** Title card: watched toggle, 1-10 score, "Quiero verla", recommend, and the group's ratings. */
const TitleCard = memo(function TitleCard({ movie: m, r, me, onSave, onPending, label }: {
  movie: CardMovie; r: RatingRow | undefined; me: string; onSave: SaveFn; onPending: PendingFn; label?: string
}) {
  const watched = r?.watched ?? false
  const pending = r?.pending ?? false
  const score = r?.score ?? null
  const ratings = r?.ratings ?? []
  const watchersCount = r?.watchersCount ?? 0
  const [hover, setHover] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const group = useRef<HTMLDivElement>(null)

  const fail = () => {
    setFailed(true)
    setTimeout(() => setFailed(false), 3000)
  }
  const rate = async (n: number) => {
    setHover(null)
    setFailed(false)
    if (!(await onSave(m.id, true, score === n ? null : n))) fail()
  }
  const wish = async () => {
    setFailed(false)
    if (!(await onPending(m.id, !pending))) fail()
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
  const shown = hover ?? score
  return (
    <article className={`card ${watched ? 'seen' : ''}`} id={`t-${m.id}`}>
      <div className="art">
        <Poster url={m.posterUrl} title={m.title} />
        {m.mediaType === 'series' && <span className="badge">Serie</span>}
        <button
          className={`check ${watched ? 'on' : ''}`}
          aria-pressed={watched}
          aria-label={watched ? `Quitar ${m.title} de las vistas` : `Marcar ${m.title} como vista`}
          onClick={() => void onSave(m.id, !watched, null)}
        >
          {watched ? '✓' : '+'}
        </button>
      </div>
      <h3>{m.title}</h3>
      <p className="year">{m.year}{m.originalTitle ? ` · ${m.originalTitle}` : ''}</p>
      {label && <p className="card-label"><span className="tag studio">{label}</span></p>}
      <p className="score-read" aria-live="polite">
        <strong>{shown ?? '–'}</strong>
        <span>{shown ? LABELS[shown - 1] : watched ? 'Sin puntaje' : 'Toca para puntuar'}</span>
      </p>
      <div className="scores" role="group" aria-label="Tu puntaje" ref={group} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`${score === n ? 'on' : ''} ${shown !== null && n <= shown ? 'fill' : ''}`}
            aria-pressed={score === n}
            aria-label={`Puntuar ${n} de 10: ${LABELS[n - 1]}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => rate(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="card-actions">
        {!watched && (
          <button className={`mini-btn ${pending ? 'on' : ''}`} aria-pressed={pending} onClick={() => void wish()}>
            {pending ? '★ En pendientes' : '☆ Quiero verla'}
          </button>
        )}
        <button className="mini-btn" onClick={() => setRecommending(true)} aria-haspopup="dialog">Recomendar…</button>
      </div>
      {failed && <p className="error small">No se pudo guardar. Inténtalo de nuevo.</p>}
      <p className="community">
        {watchersCount === 0 ? 'Nadie aún' : `Vista por ${watchersCount}`}
        {r?.averageScore != null && <b>★ {r.averageScore.toFixed(1)}</b>}
      </p>
      {ratings.length > 0 && (
        <ul className="ratings" aria-label="Puntajes de tus amigos">
          {ratings.map((x) => (
            <li key={x.tag} className={`${x.tag === me ? 'me ' : ''}${tier(x.score)}`}>
              {x.tag} <b>{x.score ?? '✓'}</b>
            </li>
          ))}
        </ul>
      )}
      {recommending && <RecommendModal movieId={m.id} title={m.title} onClose={() => setRecommending(false)} />}
    </article>
  )
})

export default TitleCard
