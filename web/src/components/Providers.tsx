import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ProviderInfo, ProviderRef, ProviderType } from '../api'
import { isFree, isSubscription, providerHome, TYPE_LABEL, useProviderLookup } from '../lib/providers'
import '../providers.css'

/** One provider logo (TMDB w92). Size comes from the surrounding CSS; a lettered tile stands in when there is no logo. */
export function ProviderLogo({ info, title }: { info: ProviderInfo | undefined; title?: string }) {
  if (!info?.logoUrl) {
    return <span className="prov-logo prov-logo-empty" title={title} aria-hidden="true">{info?.name.charAt(0) ?? ''}</span>
  }
  return (
    <img
      className="prov-logo" src={info.logoUrl} alt="" title={title} width={92} height={92}
      loading="lazy" decoding="async" referrerPolicy="no-referrer"
    />
  )
}

/**
 * Wraps a logo (or the "Gratis" capsule) in a link to the platform's own site, new tab. The click never reaches
 * the card, so it does not open the title modal. Unknown homepage: a plain element with the same tooltip.
 */
function ProviderLink({ id, info, tip, className, children }: {
  id: number; info: ProviderInfo | undefined; tip: string; className?: string; children: ReactNode
}) {
  const url = providerHome(id, info?.name)
  if (!url) return <span className={className ?? 'prov-plain'} title={tip}>{children}</span>
  return (
    <a
      className={`prov-link ${className ?? ''}`} href={url} target="_blank" rel="noopener noreferrer"
      aria-label={`Abrir ${info?.name ?? 'plataforma'}`} title={`${tip} · abrir sitio`} onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  )
}

/** Unique providers in list order, keeping the first (best) offer type of each. */
function uniqueBy(refs: ProviderRef[], keep: (t: ProviderType) => boolean): ProviderRef[] {
  const seen = new Map<number, ProviderRef>()
  for (const p of refs) {
    if (!keep(p.type)) continue
    const prev = seen.get(p.id)
    if (!prev || (prev.type !== 'flatrate' && p.type === 'flatrate')) seen.set(p.id, p)
  }
  return [...seen.values()]
}

const MAX_LOGOS = 3

/**
 * Card row under the meta line: subscription logos (max 3 + "+N"), or a muted "Alquiler/compra" pill with
 * desaturated logos when the title can only be rented or bought. The row height is always reserved.
 */
export function ProviderStrip({ refs }: { refs: ProviderRef[] | undefined }) {
  const lookup = useProviderLookup()
  const list = refs ?? []
  const subs = uniqueBy(list, isSubscription)
  const nameOf = (id: number) => lookup(id)?.name ?? 'Plataforma'

  if (subs.length > 0) {
    let shown = subs.slice(0, MAX_LOGOS)
    if (shown.some((p) => isFree(p.type))) shown = subs.slice(0, MAX_LOGOS - 1) // the "Gratis" capsule is wider
    const rest = subs.length - shown.length
    const label = `Dónde verla: ${subs.map((p) => `${nameOf(p.id)} (${TYPE_LABEL[p.type].toLowerCase()})`).join(', ')}`
    return (
      <div className="prov-strip" role="group" aria-label={label}>
        {shown.map((p) => {
          const tip = `${nameOf(p.id)} · ${TYPE_LABEL[p.type]}`
          return isFree(p.type) ? (
            <ProviderLink key={p.id} id={p.id} info={lookup(p.id)} tip={tip} className="prov-free"><ProviderLogo info={lookup(p.id)} />Gratis</ProviderLink>
          ) : (
            <ProviderLink key={p.id} id={p.id} info={lookup(p.id)} tip={tip}><ProviderLogo info={lookup(p.id)} /></ProviderLink>
          )
        })}
        {rest > 0 && <span className="prov-more" title={subs.slice(shown.length).map((p) => nameOf(p.id)).join(', ')}>+{rest}</span>}
      </div>
    )
  }

  const paid = uniqueBy(list, (t) => t === 'rent' || t === 'buy')
  if (paid.length > 0) {
    const label = `Solo alquiler o compra: ${paid.map((p) => nameOf(p.id)).join(', ')}`
    return (
      <div className="prov-strip paid" role="group" aria-label={label}>
        <span className="prov-paid" title={label}>Alquiler/compra</span>
        {paid.slice(0, 2).map((p) => (
          <ProviderLink key={p.id} id={p.id} info={lookup(p.id)} tip={`${nameOf(p.id)} · ${TYPE_LABEL[p.type]}`}>
            <ProviderLogo info={lookup(p.id)} />
          </ProviderLink>
        ))}
      </div>
    )
  }

  return <div className="prov-strip" aria-hidden="true" />
}

const GROUPS: { label: string; types: ProviderType[] }[] = [
  { label: 'Suscripción', types: ['flatrate'] },
  { label: 'Gratis con anuncios', types: ['free', 'ads'] },
  { label: 'Alquiler', types: ['rent'] },
  { label: 'Compra', types: ['buy'] },
]

/** Title modal section: providers grouped by offer type, with the JustWatch attribution TMDB requires. */
export function WhereToWatch({ id, refs, link }: { id: number; refs: ProviderRef[] | undefined; link: string | null | undefined }) {
  const lookup = useProviderLookup()
  const list = refs ?? []
  const groups = GROUPS.map((g) => ({ ...g, items: uniqueBy(list, (t) => g.types.includes(t)) })).filter((g) => g.items.length > 0)

  return (
    <section className="td-where" aria-labelledby={`td-where-${id}`}>
      <h3 id={`td-where-${id}`}>Dónde verla</h3>
      {groups.length === 0 ? (
        <p className="muted small where-empty">No hay datos de dónde verla en Argentina.</p>
      ) : (
        <>
          <dl className="where-groups">
            {groups.map((g) => (
              <div key={g.label} className="where-group">
                <dt>{g.label}</dt>
                <dd>
                  <ul className="where-chips">
                    {g.items.map((p) => {
                      const info = lookup(p.id)
                      return (
                        <li key={p.id} className="where-chip">
                          <ProviderLink id={p.id} info={info} tip={`${info?.name ?? 'Plataforma'} · ${TYPE_LABEL[p.type]}`}>
                            <ProviderLogo info={info} />
                          </ProviderLink>
                          <span>{info?.name ?? 'Plataforma'}</span>
                        </li>
                      )
                    })}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
          <p className="where-foot">
            <span>Disponibilidad en Argentina · Datos de JustWatch</span>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer">
                Ver en JustWatch / TMDB<ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </p>
        </>
      )}
    </section>
  )
}
