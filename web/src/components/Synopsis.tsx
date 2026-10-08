import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTitleExtras } from '../queries'

/**
 * Synopsis under the title and year (TMDB: Latin-American Spanish, else Spain's, else English with a note), clamped to
 * four lines with "Ver más" only when it overflows. While TMDB answers, a skeleton holds the clamped height and the
 * text keeps it, so the actions row under the header does not move when the data arrives (a title opened again
 * answers from the cache and takes only its own height). Nothing when there is no synopsis or TMDB failed.
 */
export default function Synopsis({ id }: { id: number }) {
  const { data, isPending } = useTitleExtras(id)
  const [waited] = useState(isPending)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const textId = useId()
  const text = useRef<HTMLParagraphElement>(null)
  const overview = data?.overview ?? null

  // Measured while clamped (and again on resize): expanded text has nothing hidden to measure.
  useLayoutEffect(() => {
    const p = text.current
    if (!p || open) return
    const measure = () => setOverflows(p.scrollHeight - p.clientHeight > 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(p)
    return () => ro.disconnect()
  }, [overview, open])

  if (isPending) {
    return (
      <div className="td-syn reserve" aria-hidden="true">
        <span className="td-syn-sk">{[0, 1, 2, 3].map((i) => <span key={i} className="sk" />)}</span>
      </div>
    )
  }
  if (!overview) return null
  const english = data?.overviewLang === 'en'
  return (
    <div className={`td-syn ${waited ? 'reserve' : ''}`}>
      <p id={textId} ref={text} className={`td-syn-text ${open ? '' : 'clamp'}`} lang={english ? 'en' : undefined}>{overview}</p>
      {(overflows || english) && (
        <p className="td-syn-foot">
          {english && <span className="td-syn-lang">(en inglés)</span>}
          {overflows && (
            <button type="button" className="td-syn-more" aria-expanded={open} aria-controls={textId} onClick={() => setOpen(!open)}>
              {open ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </p>
      )}
    </div>
  )
}
