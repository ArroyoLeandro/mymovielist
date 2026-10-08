import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** One horizontal row (a saga, or a themed home row): header plus a horizontal snap scroller (hidden scrollbar, desktop arrows, wheel-to-horizontal). */
export default function SagaRow({ id, name, count, seen, action, children }: {
  id?: string; name: string; count?: number; seen?: number; action?: ReactNode; children: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = row.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  useEffect(() => {
    const el = row.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Vertical wheel scrolls the row sideways; at the ends it falls through to the page.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [measure])

  useEffect(measure) // children (and so the scroll width) can change on any render

  const scrollBy = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <section className="saga" id={id}>
      <h2>
        {name}
        {count !== undefined && <span>({count}) &middot; {seen ?? 0}/{count} vistas</span>}
        {action && <span className="row-action">{action}</span>}
      </h2>
      <div className="saga-wrap" data-left={edges.left} data-right={edges.right}>
        <button type="button" className="chips-arrow left" onClick={() => scrollBy(-1)} aria-label="Anteriores" tabIndex={-1} />
        <div className="saga-scroll" ref={row} onScroll={measure}>{children}</div>
        <button type="button" className="chips-arrow right" onClick={() => scrollBy(1)} aria-label="Siguientes" tabIndex={-1} />
      </div>
    </section>
  )
}
