import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Check, ChevronDown, ListTree } from 'lucide-react'
import Popover from './Popover'

export type NavSection = { slug: string; name: string; period?: string; count: number }

type Props = {
  sections: NavSection[]
  visibleSlugs: string[] // sections currently rendered (search/filter can hide some)
  allCollapsed: boolean
  onJump: (slug: string) => void
  onToggleAll: () => void
}

/** Height of the sticky header plus the sticky toolbar holding the picker: the scrollspy line sits under them. */
const stickyOffset = (el: HTMLElement | null) =>
  (document.querySelector<HTMLElement>('.nav')?.offsetHeight ?? 60) + (el?.closest<HTMLElement>('.sticky-bar')?.offsetHeight ?? 70)

/**
 * Scrollspy: the last section (document order) whose top has reached the line under the sticky header and toolbar
 * (a jumped-to section lands there through its scroll margin); null above the first one, at the top of the page.
 */
function useScrollSpy(slugs: string[], ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<string | null>(null)
  const key = slugs.join('|')
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const line = stickyOffset(ref.current) + 24
      let current: string | null = null
      for (const slug of slugs) {
        const el = document.getElementById(`sec-${slug}`)
        if (!el) continue
        if (el.getBoundingClientRect().top > line) break
        current = slug
      }
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ref])
  return active
}

/**
 * Section picker inside the sticky studio toolbar: a trigger naming the section in view ("Todas las secciones" above
 * the first) that opens a single-choice listbox of the rendered sections (period and count); picking one jumps to it.
 * Plus the "Contraer todo / Expandir todo" toggle.
 */
export default function SectionNav({ sections, visibleSlugs, allCollapsed, onJump, onToggleAll }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const active = useScrollSpy(visibleSlugs, trigger)
  const visible = new Set(visibleSlugs)
  const options = sections.filter((s) => visible.has(s.slug))
  const current = sections.find((s) => s.slug === active)

  return (
    <div className="sec-row">
      <button
        ref={trigger} type="button" className="prov-trigger sec-trigger"
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={options.length === 0}
      >
        <ListTree size={15} aria-hidden="true" />
        <span className="prov-trigger-label">{current ? <>Sección: <b>{current.name}</b></> : 'Todas las secciones'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <Popover
          anchor={trigger} onClose={() => setOpen(false)} label="Ir a la sección" role={null} width={360}
          initialFocus={(panel) => panel.querySelector<HTMLElement>('[role="listbox"]')}
        >
          <div className="pop-head"><strong id="sec-pop-title">Ir a la sección</strong></div>
          <SectionList
            options={options}
            active={active}
            onPick={(slug) => {
              setOpen(false)
              onJump(slug)
            }}
            onClose={() => setOpen(false)}
          />
        </Popover>
      )}
      <button type="button" className="btn btn-quiet btn-sm" aria-expanded={!allCollapsed} onClick={onToggleAll}>{allCollapsed ? 'Expandir todo' : 'Contraer todo'}</button>
    </div>
  )
}

/**
 * Listbox with an active-descendant cursor: arrows, Home/End and PageUp/PageDown move it, Enter or Space picks,
 * Tab closes; the section in view is the selected option.
 */
function SectionList({ options, active, onPick, onClose }: {
  options: NavSection[]; active: string | null; onPick: (slug: string) => void; onClose: () => void
}) {
  const list = useRef<HTMLUListElement>(null)
  const [cursor, setCursor] = useState(() => Math.max(0, options.findIndex((o) => o.slug === active)))
  const at = Math.min(cursor, options.length - 1)

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    const move: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: last, PageDown: at + 5, PageUp: at - 5 }
    if (e.key in move) {
      e.preventDefault()
      setCursor(Math.min(last, Math.max(0, move[e.key])))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[at]) onPick(options[at].slug)
    } else if (e.key === 'Tab') {
      onClose()
    }
  }

  return (
    <ul
      ref={list} className="sec-list pop-scroll" role="listbox" tabIndex={0} aria-labelledby="sec-pop-title"
      aria-activedescendant={options[at] ? `sec-opt-${options[at].slug}` : undefined} onKeyDown={onKey}
    >
      {options.map((o, i) => (
        <li
          key={o.slug} id={`sec-opt-${o.slug}`} data-i={i} role="option" aria-selected={o.slug === active}
          className={`sec-opt ${i === at ? 'is-cursor' : ''}`}
          onClick={() => onPick(o.slug)} onMouseMove={() => i !== at && setCursor(i)}
        >
          {o.slug === active ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <span aria-hidden="true" />}
          <span className="sec-name">{o.name}{o.period && <em>{o.period}</em>}</span>
          <small aria-label={`${o.count} ${o.count === 1 ? 'título' : 'títulos'}`}>{o.count}</small>
        </li>
      ))}
    </ul>
  )
}
