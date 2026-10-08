import { useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Check, Eye, Send, Star, X } from 'lucide-react'
import type { RatingRow, StateTitle } from '../api'
import { useDialog } from '../lib/useDialog'
import { useTitleActions } from '../lib/useTitleActions'
import { scoreTier as tier } from '../lib/scores'
import { titleType } from '../lib/titleType'
import { useVersions } from '../queries'
import Poster from './Poster'
import { WhereToWatch } from './Providers'
import ScoreMeter from './ScoreMeter'
import type { CardMovie, PendingFn, SaveFn } from './TitleCard'

/** "Otras versiones": remakes, reboots, the series and the movie... each opens in this modal. Hidden when none. */
function Versions({ id, onOpen }: { id: number; onOpen: (t: StateTitle) => void }) {
  const { data } = useVersions(id)
  if (!data?.length) return null
  return (
    <section className="td-versions" aria-labelledby={`td-versions-${id}`}>
      <h3 id={`td-versions-${id}`}>Otras versiones</h3>
      <ul>
        {data.map((v) => {
          const type = titleType(v)
          return (
            <li key={v.id}>
              <button type="button" className="td-version" onClick={() => onOpen(v)}>
                <Poster url={v.posterUrl} title={v.title} className="td-version-thumb" />
                <span className="td-version-info">
                  <span className="td-version-title">{v.title}</span>
                  <span className="td-version-meta">{v.year}{type && <> · <span className={`td-version-type ${type.kind}`}>{type.label}</span></>}</span>
                </span>
                {v.state.watched ? <span className="tag ok">Vista ✓</span> : v.state.pending ? <span className="tag">Pendiente</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Title detail: the user's own controls first, then where to watch, other versions, every viewer's score and quiet group stats. */
export default function TitleModal({ movie: m, r, me, onSave, onPending, studioName, sectionName, paused, onRecommend, onOpen, onClose }: {
  movie: CardMovie; r: RatingRow | undefined; me: string; onSave: SaveFn; onPending: PendingFn
  studioName?: string; sectionName?: string; paused: boolean; onRecommend: () => void
  /** Opens another title in this modal (other versions). */
  onOpen: (t: StateTitle) => void
  onClose: () => void
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

  const type = titleType(m)
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
                <span className={`tag ${type?.kind ?? ''}`}>{type?.label ?? 'Película'}</span>
                {studioName && <span className="tag studio">{studioName}</span>}
                {sectionName && <span className="tag">{sectionName}</span>}
                {m.collection && <span className="tag">Saga: {m.collection.name}</span>}
              </p>
              {m.addedBy && (
                <p className="td-added">
                  Agregada por <Link to={`/u/${m.addedBy}`} onClick={onClose}>@{m.addedBy}</Link>
                </p>
              )}
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
          <Versions id={m.id} onOpen={onOpen} />

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
