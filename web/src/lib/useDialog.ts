import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not(:disabled):not([tabindex="-1"]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog behavior: locks page scroll, moves focus into the dialog and back to the opener on close,
 * closes on Escape and keeps Tab inside. `paused` hands the keyboard to a dialog stacked on top.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, paused = false) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const pausedRef = useRef(paused)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.body.style.overflow = prev
      if (opener?.isConnected) opener.focus()
    }
  }, [ref])

  // When a stacked dialog closes, take focus back unless it already returned inside this one.
  useEffect(() => {
    const el = ref.current
    if (pausedRef.current && !paused && el && !el.contains(document.activeElement)) el.focus()
    pausedRef.current = paused
  }, [paused, ref])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current
      if (pausedRef.current || !el) return
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref])
}
