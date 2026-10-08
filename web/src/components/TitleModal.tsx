import { useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Check, Plus, Send, Users, X } from 'lucide-react'
import type { RatingRow } from '../api'
import { useDialog } from '../lib/useDialog'
import { useTitleActions } from '../lib/useTitleActions'
import { scoreTier as tier } from '../lib/scores'
import Poster from './Poster'
import ScoreMeter from './ScoreMeter'
import type { CardMovie, PendingFn, SaveFn } from './TitleCard'

/** Title detail: group stats, every viewer's score, and the user's own controls. */
export default function TitleModal({ movie: m, r, me, onSave, onPending, studioName, sectionName, paused, onRecommend, onClose }: {
  movie: CardMovie; r: RatingRow | undefined; me: string; onSave: SaveFn; onPending: PendingFn
  studioName?: string; sectionName?: string; paused: boolean; onRecommend: () => void; onClose: () => void
}) {
  const { watched, pending, score, failed, toggleWatched, wish, setScore } = useTitleActions(m.id, r, onSave, onPending)
  const dialog = useRef<HTMLDivElement>(null)
  useDialog(dialog, onClose, paused)

  const ratings = r?.ratings
  const people = useMemo(() => {
    const all = ratings ?? []
    const mine = all.filter((x) => x.tag === me)
    const rest = all.filter((x) => x.tag !== me).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.tag.localeCompare(b.tag))
    return [...mine, ...rest]
  }, [ratings, me])
  const dist = useMemo(() => {
    const d = Array<number>(10).fill(0)
    ;(ratings ?? []).forEach((x) => { if (x.score !== null) d[x.score - 1]++ })
    return d
  }, [ratings])
  const maxDist = Math.max(1, ...dist)
  const scored = dist.reduce((a, b) => a + b, 0)

  const bg = m.posterUrl ? ({ '--td-bg': `url(${JSON.stringify(m.posterUrl)})` } as CSSProperties) : undefined
  const count = r?.watchersCount ?? 0
  return createPortal(
    <div className="td-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="td" role="dialog" aria-modal="true" aria-labelledby={`td-title-${m.id}`} ref={dialog} tabIndex={-1}>
        <button type="button" className="btn btn-icon btn-overlay td-close" aria-label="Cerrar" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        <div className="td-scroll">
          <header className={`td-head ${m.posterUrl ? 'has-bg' : ''}`} style={bg}>
            <div className="td-poster"><Poster url={m.posterUrl} title={m.title} /></div>
            <div className="td-info">
              <h2 id={`td-title-${m.id}`}>{m.title}</h2>
              {m.originalTitle && <p className="td-orig">{m.originalTitle}</p>}
              <p className="td-year">{m.year}</p>
              <p className="td-tags">
                <span className={`tag ${m.mediaType === 'series' ? 'series' : ''}`}>{m.mediaType === 'series' ? 'Serie' : 'Película'}</span>
                {studioName && <span className="tag studio">{studioName}</span>}
                {sectionName && <span className="tag">{sectionName}</span>}
                {m.collection && <span className="tag">Saga: {m.collection.name}</span>}
              </p>
            </div>
          </header>

          <section className="td-stats" aria-label="Puntajes del grupo">
            <div className="td-avg">
              <strong>{r?.averageScore != null ? r.averageScore.toFixed(1) : '–'}</strong>
              <span>promedio</span>
            </div>
            <div className="td-count">
              <strong><Users size={18} aria-hidden="true" /> {count}</strong>
              <span>{count === 1 ? 'persona la vio' : 'personas la vieron'}</span>
            </div>
            <div
              className="td-dist"
              role="img"
              aria-label={scored ? `Distribución de puntajes: ${dist.map((n, i) => `${i + 1}: ${n}`).join(', ')}` : 'Sin puntajes todavía'}
            >
              {dist.map((n, i) => (
                <div key={i} className={`td-bar ${tier(i + 1)}`} title={`${i + 1}: ${n}`}>
                  <i style={{ height: `${n ? Math.max(8, (n / maxDist) * 100) : 0}%` }} />
                  <small>{i + 1}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="td-mine" aria-label="Tus controles">
            <div className="td-mine-top">
              <button type="button" className={`btn btn-ghost ${watched ? 'on' : ''}`} aria-pressed={watched} onClick={toggleWatched}>
                {watched ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                {watched ? 'Vista' : 'Marcar como vista'}
              </button>
              {!watched && (
                <button type="button" className={`btn btn-ghost ${pending ? 'on' : ''}`} aria-pressed={pending} onClick={() => void wish()}>
                  {pending ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
                  {pending ? 'En pendientes' : 'Quiero verla'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" aria-haspopup="dialog" onClick={onRecommend}>
                <Send size={16} aria-hidden="true" /> Recomendar
              </button>
            </div>
            <ScoreMeter value={score} onChange={(n) => void setScore(n)} />
            {failed && <p className="error small" role="alert">No se pudo guardar. Inténtalo de nuevo.</p>}
          </section>

          <section className="td-people" aria-labelledby={`td-people-${m.id}`}>
            <h3 id={`td-people-${m.id}`}>Quién la vio</h3>
            {people.length === 0 ? (
              <p className="muted">Nadie del grupo la vio todavía. Márcala como vista y sé el primero en puntuarla.</p>
            ) : (
              <ul>
                {people.map((x) => (
                  <li key={x.tag} className={x.tag === me ? 'me' : ''}>
                    <Link to={`/u/${x.tag}`} onClick={onClose}>@{x.tag}{x.tag === me ? ' (tú)' : ''}</Link>
                    {x.score !== null ? <span className={`pill ${tier(x.score)}`}>{x.score}</span> : <span className="muted small">✓ vista sin puntaje</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
