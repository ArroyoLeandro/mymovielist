import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

/**
 * Scroll handling for a router without a data layer: new pages (PUSH/REPLACE to another path) start at the top,
 * back/forward (POP) restores the position the page had. Render once inside the router.
 */
export function ScrollManager() {
  const { pathname, key } = useLocation()
  const type = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const current = useRef(key)
  const prevPath = useRef(pathname)

  useEffect(() => {
    const prev = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const onScroll = () => positions.current.set(current.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      history.scrollRestoration = prev
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useLayoutEffect(() => {
    current.current = key
    if (type === 'POP') {
      const y = positions.current.get(key) ?? 0
      let tries = 0
      const step = () => {
        // Content may still be loading: wait (briefly) until the page is tall enough.
        if (document.documentElement.scrollHeight - window.innerHeight >= y || tries++ > 40) window.scrollTo(0, y)
        else requestAnimationFrame(step)
      }
      step()
    } else if (pathname !== prevPath.current) {
      window.scrollTo(0, 0)
    }
    prevPath.current = pathname
  }, [key, type, pathname])

  return null
}

/** Floating "back to top" button, shown after scrolling down. */
export function ToTopButton() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button
      type="button"
      className={`to-top ${visible ? 'show' : ''}`}
      aria-label="Ir arriba"
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <i aria-hidden="true" />
    </button>
  )
}

/** "← Volver": history back when the user navigated inside the app, else to the logical parent. */
export function BackButton() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  if (pathname === '/') return null
  const inApp = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  const parent = pathname.startsWith('/studio/') ? '/estudios' : '/'
  return (
    <button type="button" className="back" onClick={() => (inApp ? nav(-1) : nav(parent, { replace: true }))}>
      <span aria-hidden="true">←</span> Volver
    </button>
  )
}
