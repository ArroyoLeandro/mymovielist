import { useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Check, Eye, Send, Star, X } from 'lucide-react'
import type { RatingRow } from '../api'
import { useDialog } from '../lib/useDialog'
import { useTitleActions } from '../lib/useTitleActions'
import { scoreTier as tier } from '../lib/scores'
import Poster from './Poster'
import { WhereToWatch } from './Providers'
import ScoreMeter from './ScoreMeter'
import type { CardMovie, PendingFn, SaveFn } from './TitleCard'

/** Title detail: the user's own controls first, then where to watch, every viewer's score and quiet group stats. */
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

          <div className="td-actions" role="group" aria-label="Tus acciones">
            <button type="button" className={`td-act ${watched ? 'on' : ''}`} aria-pressed={watched} onClick={toggleWatched}>
              {watched ? <Check size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              <span>{watched ? 'Vista' : 'Ya la vi'}</span>
            </button>
            {!watched && (
              <button type="button" className={`td-act ${pending ? 'on' : ''}`} aria-pressed={pending} onClick={() => void wish()}>
                {pending ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
                <span>{pending ? 'Pendiente' : 'Quiero verla'}</span>
              </button>
            )}
            <button type="button" className="td-act" aria-haspopup="dialog" onClick={onRecommend}>
              <Send size={18} aria-hidden="true" />
              <span>Recomendar</span>
            </button>
          </div>
          {failed && <p className="error small td-error" role="alert">No se pudo guardar. Inténtalo de nuevo.</p>}

          <section className="td-mine" aria-label="Tu puntaje">
            <ScoreMeter
              value={score}
              onChange={(n) => void setScore(n)}
              compact={!watched}
              hint={watched ? undefined : 'Al puntuarla queda marcada como vista'}
            />
          </section>

          <WhereToWatch id={m.id} refs={m.providers} link={m.providersLink} />

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

          {count > 0 && (
            <section className="td-group" aria-label="Puntajes del grupo">
              <p className="td-group-line">
                {r?.averageScore != null && (
                  <>
                    <Star size={14} className="td-star" aria-hidden="true" />
                    <strong>{r.averageScore.toFixed(1)}</strong> promedio ·{' '}
                  </>
                )}
                {count} {count === 1 ? 'la vio' : 'la vieron'}
              </p>
              {scored > 0 && (
                <div className="td-dist" role="img" aria-label={`Distribución de puntajes: ${dist.map((n, i) => `${i + 1}: ${n}`).join(', ')}`}>
                  {dist.map((n, i) => (
                    <i key={i} className={n ? 'has' : ''} style={n ? { height: `${Math.max(15, (n / maxDist) * 100)}%` } : undefined} title={`${i + 1}: ${n}`} />
                  ))}
                  <small aria-hidden="true">1</small>
                  <small aria-hidden="true">10</small>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
