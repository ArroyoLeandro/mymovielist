import { scrollBehavior } from './motion'

/** Forces a skipped `content-visibility: auto` block to render for one frame (see `.era-body.cv-measure`). */
const MEASURE = 'cv-measure'
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * Scrolls `el` into view (with its scroll margin) and lands exactly on the first try on pages whose blocks render
 * lazily (`.era-body { content-visibility: auto; contain-intrinsic-size: auto 900px }`).
 *
 * The off-screen blocks above the target (and the one holding it) only have the 900px estimate until rendered, so a
 * scroll computed from them lands short or long. They are rendered for one frame first: the `auto` keyword makes the
 * browser remember their real size once they have rendered, so the placeholders are exact afterwards. Then the usual
 * scroll runs, and one settle pass re-aligns instantly if anything still moved it (images, fonts) by more than 4px,
 * unless the user scrolled meanwhile.
 */
export async function scrollToExact(el: HTMLElement, block: ScrollLogicalPosition = 'start') {
  const bodies = [...document.querySelectorAll<HTMLElement>('.era-body')].filter(
    (b) => b.contains(el) || !!(b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
  )
  if (bodies.length) {
    bodies.forEach((b) => b.classList.add(MEASURE))
    // The remembered size is recorded during a rendering update, not on a forced layout: keep them rendered for a frame.
    await frame()
    await frame()
    bodies.forEach((b) => b.classList.remove(MEASURE))
  }
  if (!el.isConnected || offBy(el, block) <= 1) return // already there: no scroll, no scrollend to wait for
  el.scrollIntoView({ behavior: scrollBehavior(), block })

  let userScrolled = false
  const onUser = () => { userScrolled = true }
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  events.forEach((e) => window.addEventListener(e, onUser, { passive: true, once: true }))
  await settled()
  events.forEach((e) => window.removeEventListener(e, onUser))
  if (userScrolled || !el.isConnected || offBy(el, block) <= 4) return
  el.scrollIntoView({ behavior: 'auto', block })
}

/**
 * Resolves when the scroll has ended: on `scrollend` where supported (a smooth scroll can start late or pause for a
 * few frames, so stillness alone is not proof), else once the page has moved and then not moved for 10 frames; never
 * later than 4s.
 */
async function settled() {
  if ('onscrollend' in (window as object)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer)
        window.removeEventListener('scrollend', done)
        resolve()
      }
      const timer = window.setTimeout(done, 4000)
      window.addEventListener('scrollend', done)
    })
    return
  }
  const start = window.scrollY
  let last = start
  let still = 0
  for (let i = 0; i < 240 && (last === start || still < 10); i++) {
    await frame()
    still = window.scrollY === last ? still + 1 : 0
    last = window.scrollY
  }
}

/** Distance between where `el` is and where `scrollIntoView({ block })` puts it, scroll margins included. */
function offBy(el: HTMLElement, block: ScrollLogicalPosition) {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const top = r.top - parseFloat(cs.scrollMarginTop)
  const bottom = r.bottom + parseFloat(cs.scrollMarginBottom)
  // Positive: the page would have to scroll further down. At either end of the page it cannot get any closer.
  const delta = block === 'center' ? (top + bottom) / 2 - window.innerHeight / 2 : top
  const max = document.documentElement.scrollHeight - window.innerHeight
  if ((delta > 0 && window.scrollY >= max - 1) || (delta < 0 && window.scrollY <= 0)) return 0
  return Math.abs(delta)
}
