import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Check, Plus, Send, Users, X } from 'lucide-react'
import type { RatingRow } from '../api'
import { useTitleActions } from '../lib/useTitleActions'
import Poster from './Poster'
import type { CardMovie, PendingFn, SaveFn } from './TitleCard'

const SCORE_LABELS = ['Horrible', 'Malo', 'Flojo', 'Regular', 'Pasable', 'Decente', 'Bueno', 'Muy bueno', 'Excelente', 'Obra maestra']
const tier = (s: number | null) => (s === null ? '' : s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high')
const FOCUSABLE = 'a[href], button:not(:disabled):not([tabindex="-1"]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/** Title detail: group stats, every viewer's score, and the user's own controls. */
export default function TitleModal({ movie: m, r, me, onSave, onPending, studioName, sectionName, paused, onRecommend, onClose }: {
  movie: CardMovie; r: RatingRow | undefined; me: string; onSave: SaveFn; onPending: PendingFn
  studioName?: string; sectionName?: string; paused: boolean; onRecommend: () => void; onClose: () => void
}) {
  const { watched, pending, score, failed, toggleWatched, wish, setScore } = useTitleActions(m.id, r, onSave, onPending)
  const [hover, setHover] = useState<number | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pausedRef = useRef(paused)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Lock page scroll, remember the opener, restore both on close.
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    return () => {
      document.body.style.overflow = prev
      if (opener.current?.isConnected) opener.current.focus()
    }
  }, [])
  // The recommend dialog stacks on top: leave Esc/Tab to it, then take focus back when it closes.
  useEffect(() => {
    if (pausedRef.current && !paused) dialog.current?.focus()
    pausedRef.current = paused
  }, [paused])
  // Esc closes; Tab wraps inside the dialog.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (pausedRef.current) return
      if (e.key === 'Escape') return void closeRef.current()
      if (e.key !== 'Tab' || !dialog.current) return
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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

  const shown = hover ?? score
  const rate = (n: number) => setScore(score === n ? null : n)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (/^[0-9]$/.test(e.key)) return void rate(e.key === '0' ? 10 : Number(e.key))
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const btns = Array.from(group.current?.querySelectorAll('button') ?? [])
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[Math.min(9, Math.max(0, i + step))]?.focus()
  }

  const bg = m.posterUrl ? ({ '--td-bg': `url(${JSON.stringify(m.posterUrl)})` } as CSSProperties) : undefined
  const count = r?.watchersCount ?? 0
  return createPortal(
    <div className="td-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="td" role="dialog" aria-modal="true" aria-labelledby={`td-title-${m.id}`} ref={dialog} tabIndex={-1}>
        <button type="button" className="td-close" aria-label="Cerrar" onClick={onClose}><X size={20} aria-hidden="true" /></button>
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
              <button type="button" className={`td-btn ${watched ? 'on' : ''}`} aria-pressed={watched} onClick={toggleWatched}>
                {watched ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                {watched ? 'Vista' : 'Marcar como vista'}
              </button>
              {!watched && (
                <button type="button" className={`td-btn ${pending ? 'on' : ''}`} aria-pressed={pending} onClick={() => void wish()}>
                  {pending ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
                  {pending ? 'En pendientes' : 'Quiero verla'}
                </button>
              )}
              <button type="button" className="td-btn" aria-haspopup="dialog" onClick={onRecommend}>
                <Send size={16} aria-hidden="true" /> Recomendar
              </button>
            </div>
            <p className="score-read" aria-live="polite">
              <strong>{shown ?? '–'}</strong>
              <span>{shown ? SCORE_LABELS[shown - 1] : watched ? 'Sin puntaje' : 'Toca un número para puntuar'}</span>
            </p>
            <div className="scores td-scores" role="group" aria-label="Tu puntaje" ref={group} onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={`${score === n ? 'on' : ''} ${shown !== null && n <= shown ? 'fill' : ''}`}
                  aria-pressed={score === n}
                  aria-label={`Puntuar ${n} de 10: ${SCORE_LABELS[n - 1]}`}
                  onMouseEnter={() => setHover(n)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(null)}
                  onClick={() => void rate(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {failed && <p className="error small" role="alert">No se pudo guardar. Inténtalo de nuevo.</p>}
          </section>

          <section className="td-people">
            <h3>Quién la vio</h3>
            {people.length === 0 ? (
              <p className="muted">Nadie la vio todavía.</p>
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
