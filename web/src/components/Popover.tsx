import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const isPhone = () => window.matchMedia('(max-width: 599.98px)').matches

/**
 * Toolbar popover shared by the pickers (platforms, studio sections): anchored under its trigger on wider screens and
 * kept inside the viewport on resize and scroll; a bottom sheet over a scrim on phones. Escape and outside clicks
 * close it and focus goes back to the trigger. Rendered in a portal because toolbars scroll sideways on phones.
 * `children` may be a function of `sheet` for content that only phones get (a "Listo" button).
 */
export default function Popover({ anchor, onClose, label, role = 'dialog', width = 340, className = '', initialFocus, children }: {
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  label: string
  /** The panel's role; null when the content carries its own (a listbox). */
  role?: string | null
  width?: number
  className?: string
  /** What gets focus on open (default: the panel itself). */
  initialFocus?: (panel: HTMLElement, sheet: boolean) => HTMLElement | null | undefined
  children: ReactNode | ((sheet: boolean) => ReactNode)
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [sheet] = useState(isPhone)
  const [pos, setPos] = useState<CSSProperties>()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const focusRef = useRef(initialFocus)

  useLayoutEffect(() => {
    if (sheet) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const w = Math.min(width, window.innerWidth - 32)
      const left = Math.min(Math.max(16, r.left), window.innerWidth - 16 - w)
      const top = r.bottom + 8
      setPos({ left, top, width: w, maxHeight: Math.max(220, window.innerHeight - top - 16) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, sheet, width])

  useEffect(() => {
    const opener = anchor.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !opener?.contains(t)) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    const prevOverflow = document.body.style.overflow
    if (sheet) document.body.style.overflow = 'hidden'
    const el = panel.current
    const first = el ? (focusRef.current?.(el, sheet) ?? el) : null
    first?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      if (sheet) document.body.style.overflow = prevOverflow
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || el?.contains(document.activeElement))) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [anchor, sheet])

  const body = (
    <div ref={panel} className={`pop ${sheet ? 'sheet' : ''} ${className}`} style={sheet ? undefined : pos} role={role ?? undefined} aria-label={role ? label : undefined} tabIndex={-1}>
      {typeof children === 'function' ? children(sheet) : children}
    </div>
  )
  return createPortal(sheet ? <div className="pop-back">{body}</div> : body, document.body)
}
