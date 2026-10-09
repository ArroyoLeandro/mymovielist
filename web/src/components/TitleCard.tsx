import { memo, useContext, useEffect, useRef, useState } from 'react'
import { Plus, Check, Bookmark, BookmarkCheck, Send, ChevronRight } from 'lucide-react'
import type { Availability, RatingRow, TitleSummary } from '../api'
import { ProviderDictContext } from '../lib/providers'
import { titleType } from '../lib/titleType'
import { useTitleActions } from '../lib/useTitleActions'
import Card from './Card'
import RecommendModal from './RecommendModal'
import { useTitleDetail } from './TitleDetail'

export type SaveFn = (movieId: number, watched: boolean, score: number | null) => Promise<boolean>
export type PendingFn = (movieId: number, pending: boolean) => Promise<boolean>
export type CardMovie = Pick<TitleSummary, 'id' | 'title' | 'originalTitle' | 'year' | 'posterUrl' | 'mediaType' | 'animated'> & {
  collection?: { slug: string; name: string } | null
  addedBy?: string | null
} & Partial<Availability>

/**
 * Title card container: renders the shared Card with its type label, the viewer's score, the icon actions (watched,
 * wishlist, recommend), title/year, where to watch (logo row) and the group summary as the card footer.
 * Scoring and the per-friend ratings live in the detail modal (TitleModal), hosted by TitleDetailProvider so it
 * survives the card leaving its list; the card keeps it fed with fresh state while both are on screen.
 */
const TitleCard = memo(function TitleCard({ movie: m, r, onSave, onPending, label, studioName, sectionName }: {
  movie: CardMovie; r: RatingRow | undefined; onSave: SaveFn; onPending: PendingFn
  label?: string; studioName?: string; sectionName?: string
}) {
  const { watched, pending, score, failed, toggleWatched, wish } = useTitleActions(m.id, r, onSave, onPending)
  const watchersCount = r?.watchersCount ?? 0
  const [recommending, setRecommending] = useState(false)
  const detail = useTitleDetail()
  const dict = useContext(ProviderDictContext)
  const [open, setOpen] = useState(false)
  const token = useRef(0)
  const openDetail = () => {
    token.current = detail.open({
      movie: m, r, onSave, onPending, studioName: studioName ?? label, sectionName, dict, onClosed: () => setOpen(false),
    })
    setOpen(true)
  }
  useEffect(() => {
    if (open) detail.update(token.current, { r, onSave, onPending })
  }, [open, r, onSave, onPending, detail])

  return (
    <Card
      id={`t-${m.id}`}
      className={watched ? 'seen' : ''}
      title={m.title}
      posterUrl={m.posterUrl}
      onOpen={openDetail}
      badge={titleType(m)}
      pill={score !== null && <span className="my-score" title="Tu puntaje">★ {score}</span>}
      overlay={
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
      }
      meta={<>{m.year}{label ? ` · ${label}` : ''}</>}
      providers={m.providers}
      actions={
        <button type="button" className="summary" aria-haspopup="dialog" onClick={openDetail}>
          <span className="sum-stats">
            {watchersCount === 0 ? 'Nadie la vio todavía' : (
              <>{r?.averageScore != null && <b>★ {r.averageScore.toFixed(1)} · </b>}{watchersCount === 1 ? '1 la vio' : `${watchersCount} la vieron`}</>
            )}
          </span>
          <span className="more">{watchersCount === 0 ? 'Puntuar' : 'Ver puntuaciones'}<ChevronRight size={12} aria-hidden="true" /></span>
        </button>
      }
    >
      {failed && <p className="error small" role="alert">No se pudo guardar. Inténtalo de nuevo.</p>}
      {recommending && <RecommendModal movieId={m.id} title={m.title} onClose={() => setRecommending(false)} />}
    </Card>
  )
})

export default TitleCard
