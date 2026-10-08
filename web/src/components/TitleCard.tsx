import { memo, useState } from 'react'
import { Plus, Check, Bookmark, BookmarkCheck, Send, ChevronRight } from 'lucide-react'
import type { Availability, RatingRow, TitleSummary } from '../api'
import { useTitleActions } from '../lib/useTitleActions'
import Poster from './Poster'
import { ProviderStrip } from './Providers'
import RecommendModal from './RecommendModal'
import TitleModal from './TitleModal'

export type SaveFn = (movieId: number, watched: boolean, score: number | null) => Promise<boolean>
export type PendingFn = (movieId: number, pending: boolean) => Promise<boolean>
export type CardMovie = Pick<TitleSummary, 'id' | 'title' | 'originalTitle' | 'year' | 'posterUrl' | 'mediaType'> & {
  collection?: { slug: string; name: string } | null
  addedBy?: string | null
} & Partial<Availability>

/**
 * Compact title card: poster with icon actions (watched, wishlist, recommend), title/year, where to watch (logo row)
 * and a one-line group summary.
 * Scoring and the per-friend ratings live in the detail modal (TitleModal).
 */
const TitleCard = memo(function TitleCard({ movie: m, r, me, onSave, onPending, label, studioName, sectionName }: {
  movie: CardMovie; r: RatingRow | undefined; me: string; onSave: SaveFn; onPending: PendingFn
  label?: string; studioName?: string; sectionName?: string
}) {
  const { watched, pending, score, failed, toggleWatched, wish } = useTitleActions(m.id, r, onSave, onPending)
  const watchersCount = r?.watchersCount ?? 0
  const [detail, setDetail] = useState(false)
  const [recommending, setRecommending] = useState(false)

  return (
    <article className={`card ${watched ? 'seen' : ''}`} id={`t-${m.id}`}>
      <div className="art">
        <Poster url={m.posterUrl} title={m.title} />
        {/* Mouse/touch convenience; keyboard and screen-reader users open the detail from the title or summary. */}
        <button type="button" className="art-open" tabIndex={-1} aria-hidden="true" onClick={() => setDetail(true)} />
        {m.mediaType === 'series' && <span className="badge">Serie</span>}
        {score !== null && <span className="my-score" title="Tu puntaje">★ {score}</span>}
        <div className="art-actions">
          <button
            type="button"
            className={`act ${watched ? 'on' : ''}`}
            aria-pressed={watched}
            aria-label={watched ? `Quitar ${m.title} de las vistas` : `Marcar ${m.title} como vista`}
            data-tip={watched ? 'Quitar de vistas' : 'Marcar como vista'}
            onClick={toggleWatched}
          >
            {watched ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <Plus size={16} strokeWidth={2.5} aria-hidden="true" />}
          </button>
          {!watched && (
            <button
              type="button"
              className={`act ${pending ? 'on' : ''}`}
              aria-pressed={pending}
              aria-label={pending ? `Quitar ${m.title} de pendientes` : `Quiero ver ${m.title}`}
              data-tip={pending ? 'Quitar de pendientes' : 'Quiero verla'}
              onClick={() => void wish()}
            >
              {pending ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className="act"
            aria-label={`Recomendar ${m.title} a un amigo`}
            aria-haspopup="dialog"
            data-tip="Recomendar a un amigo"
            onClick={() => setRecommending(true)}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <h3><button type="button" className="title-open" aria-haspopup="dialog" onClick={() => setDetail(true)}>{m.title}</button></h3>
      <p className="year">{m.year}{label ? ` · ${label}` : ''}</p>
      <ProviderStrip refs={m.providers} />
      <button type="button" className="summary" aria-haspopup="dialog" onClick={() => setDetail(true)}>
        <span className="sum-stats">
          {watchersCount === 0 ? 'Nadie la vio todavía' : (
            <>{r?.averageScore != null && <b>★ {r.averageScore.toFixed(1)} · </b>}{watchersCount === 1 ? '1 la vio' : `${watchersCount} la vieron`}</>
          )}
        </span>
        <span className="more">{watchersCount === 0 ? 'Puntuar' : 'Ver puntuaciones'}<ChevronRight size={12} aria-hidden="true" /></span>
      </button>
      {failed && <p className="error small" role="alert">No se pudo guardar. Inténtalo de nuevo.</p>}
      {detail && (
        <TitleModal
          movie={m} r={r} me={me} onSave={onSave} onPending={onPending}
          studioName={studioName ?? label} sectionName={sectionName}
          paused={recommending} onRecommend={() => setRecommending(true)} onClose={() => setDetail(false)}
        />
      )}
      {recommending && <RecommendModal movieId={m.id} title={m.title} onClose={() => setRecommending(false)} />}
    </article>
  )
})

export default TitleCard
