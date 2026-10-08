import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { scrollBehavior } from '../lib/motion'

export type NavSection = { slug: string; name: string; period?: string; count: number }

type Props = {
  sections: NavSection[]
  visibleSlugs: string[] // sections currently rendered (search/filter can hide some)
  allCollapsed: boolean
  onJump: (slug: string) => void
  onToggleAll: () => void
}

/** Height of the sticky header plus the sticky toolbar holding the row: the scrollspy band starts below them. */
const stickyOffset = (el: HTMLElement | null) =>
  (document.querySelector<HTMLElement>('.nav')?.offsetHeight ?? 60) + (el?.closest<HTMLElement>('.sticky-bar')?.offsetHeight ?? 70)

/** Section jump row (inside the sticky studio toolbar): hidden scrollbar, edge fades, desktop arrows, wheel-to-horizontal and scrollspy. */
export default function SectionNav({ sections, visibleSlugs, allCollapsed, onJump, onToggleAll }: Props) {
  const row = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [active, setActive] = useState<string | null>(null)

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
  }, [measure, sections])

  // Scrollspy: the first section (document order) that overlaps the band just under the sticky header.
  const key = visibleSlugs.join('|')
  useEffect(() => {
    const els = visibleSlugs.map((s) => document.getElementById(`sec-${s}`)).filter((e): e is HTMLElement => !!e)
    if (!els.length) return
    const inView = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const slug = en.target.id.slice(4)
          if (en.isIntersecting) inView.add(slug)
          else inView.delete(slug)
        }
        const first = visibleSlugs.find((s) => inView.has(s))
        if (first) setActive(first)
      },
      // The band starts under the sticky header + toolbar.
      { rootMargin: `-${stickyOffset(row.current)}px 0px -60% 0px` },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Keep the active chip visible inside the row without moving the page.
  useEffect(() => {
    const el = row.current
    const chip = active ? el?.querySelector<HTMLElement>(`[data-slug="${active}"]`) : null
    if (!el || !chip) return
    const target = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2
    el.scrollTo({ left: Math.max(0, target), behavior: scrollBehavior() })
  }, [active])

  const scrollBy = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.7, behavior: scrollBehavior() })

  return (
    <div className="chips-row">
      <div className="chips-wrap" data-left={edges.left} data-right={edges.right}>
        <button type="button" className="chips-arrow left" onClick={() => scrollBy(-1)} aria-label="Secciones anteriores" tabIndex={-1}><ChevronLeft size={16} aria-hidden="true" /></button>
        <nav className="chips" ref={row} onScroll={measure} aria-label="Ir a la sección">
          {sections.map((s) => (
            <button key={s.slug} type="button" data-slug={s.slug} className={`chip ${active === s.slug ? 'on' : ''}`} aria-current={active === s.slug ? 'location' : undefined} onClick={() => onJump(s.slug)} title={s.period}>
              {s.name} <small>{s.count}</small>
            </button>
          ))}
        </nav>
        <button type="button" className="chips-arrow right" onClick={() => scrollBy(1)} aria-label="Más secciones" tabIndex={-1}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <button type="button" className="btn btn-quiet btn-sm" aria-expanded={!allCollapsed} onClick={onToggleAll}>{allCollapsed ? 'Expandir todo' : 'Contraer todo'}</button>
    </div>
  )
}
