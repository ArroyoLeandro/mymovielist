import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ProviderRef } from '../api'
import type { TitleKind } from '../lib/titleType'
import Poster from './Poster'
import { ProviderStrip } from './Providers'

/**
 * The one card shell used by every title grid (catalog, studio page, home, search, profile) and by the saga cards.
 * Presentational only: no data fetching, mutations or per-user state; containers (TitleCard, ProfileCard, the home saga
 * row) decide what goes in each slot.
 *
 * Layout: a card surface with the poster flush at the top (clipped to the card's top corners) carrying its overlays
 * (type badge top-left, a pill bottom-left, icon actions bottom-right), then a padded body: a two-line title slot, the
 * meta line, the providers, optional content, and an actions footer pinned to the bottom so every card in a grid row
 * has the same height and lines up.
 *
 * `onOpen` makes the poster and the title open the title detail (the title is the keyboard/screen-reader target);
 * `to` makes the whole card a link instead (sagas).
 */
export default function Card({
  title, posterUrl, id, className = '', to, onOpen, badge, pill, overlay, meta, providers, withProviders = true, children, actions,
}: {
  title: string
  posterUrl: string | null
  id?: string
  className?: string
  to?: string
  onOpen?: () => void
  badge?: { kind: TitleKind; label: string } | null
  pill?: ReactNode
  overlay?: ReactNode
  meta?: ReactNode
  providers?: ProviderRef[]
  /** False hides the provider row (sagas have no providers). */
  withProviders?: boolean
  children?: ReactNode
  actions?: ReactNode
}) {
  const body = (
    <>
      <div className="art">
        <Poster url={posterUrl} title={title} />
        {/* Mouse/touch convenience; keyboard and screen-reader users open the detail from the title. */}
        {onOpen && <button type="button" className="art-open" tabIndex={-1} aria-hidden="true" onClick={onOpen} />}
        {badge && <span className={`badge ${badge.kind}`}>{badge.label}</span>}
        {pill}
        {overlay}
      </div>
      <div className="card-body">
        <h3>{onOpen ? <button type="button" className="title-open" aria-haspopup="dialog" onClick={onOpen}>{title}</button> : <span className="card-title">{title}</span>}</h3>
        {meta != null && <p className="year">{meta}</p>}
        {withProviders && <ProviderStrip refs={providers} />}
        {children}
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </>
  )
  const cls = `card ${className}`.trim()
  return to ? <Link to={to} id={id} className={cls}>{body}</Link> : <article id={id} className={cls}>{body}</article>
}

/** Loading placeholder with the same shell and boxes: poster, two-line title, meta, providers, footer line. */
export function CardSkeleton() {
  return (
    <div className="card is-sk" aria-hidden="true">
      <div className="art"><span className="sk sk-poster" /></div>
      <div className="card-body">
        <div className="sk-card-title">
          <span className="sk sk-line" style={{ width: '85%' }} />
          <span className="sk sk-line" style={{ width: '55%' }} />
        </div>
        <span className="sk sk-line sm" style={{ width: '40%' }} />
        <span className="sk sk-line sm" style={{ width: '70%' }} />
        <div className="card-actions"><span className="sk sk-line sm" style={{ width: '45%' }} /></div>
      </div>
    </div>
  )
}
