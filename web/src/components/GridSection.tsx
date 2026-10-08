import type { ReactNode } from 'react'

/** Titled section with a wrapping card grid (sagas on the studio page, themed sections on the home). */
export default function GridSection({ id, name, meta, action, capped = false, children }: {
  id?: string; name: string; meta?: ReactNode; action?: ReactNode; capped?: boolean; children: ReactNode
}) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2>{name}</h2>
        {meta && <span className="section-meta">{meta}</span>}
        {action}
      </div>
      <div className={`grid ${capped ? 'capped' : ''}`}>{children}</div>
    </section>
  )
}
