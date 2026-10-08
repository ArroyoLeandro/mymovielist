import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Toolbar that sticks under the site header. A sentinel placed one header-height above the bar
 * tells (via IntersectionObserver, no scroll listeners) when it is stuck (.stuck compacts it in CSS); its height is published
 * as --toolbar-h so anchored scroll targets land below it.
 */
export default function StickyBar({ label, children }: { label: string; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const el = bar.current
    if (!el) return
    const root = document.documentElement.style
    const ro = new ResizeObserver(() => root.setProperty('--toolbar-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.removeProperty('--toolbar-h')
    }
  }, [])

  return (
    <>
      <div ref={sentinel} className="sticky-sentinel" aria-hidden="true" />
      <div ref={bar} className={`sticky-bar ${stuck ? 'stuck' : ''}`} role="region" aria-label={label}>
        {children}
      </div>
    </>
  )
}
