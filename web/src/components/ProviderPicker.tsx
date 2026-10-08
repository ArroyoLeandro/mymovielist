import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Tv } from 'lucide-react'
import type { ProviderInfo } from '../api'
import { PTYPES, type PType } from '../lib/providers'
import { ProviderLogo } from './Providers'
import '../providers.css'

export interface PickerOption extends ProviderInfo { id: number; count: number }

const SEARCH_FROM = 12
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * "Plataforma" filter: a toolbar button opening a popover (a bottom sheet on phones) with a multi-select list of
 * providers and, once one is picked, the offer type. Rendered in a portal because toolbars scroll sideways on phones.
 */
export default function ProviderPicker({ options, selected, onChange, ptype, onPType, summary = true }: {
  options: PickerOption[]; selected: number[]; onChange: (ids: number[]) => void; ptype: PType; onPType: (t: PType) => void
  /** Trigger shows the picked logos, names and type; off when the page lists them as removable chips. */
  summary?: boolean
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const picked = selected.map((id) => byId.get(id)).filter((o): o is PickerOption => !!o)
  const label = picked.length === 0 || !summary ? 'Plataforma' : picked.length === 1 ? picked[0].name : `${picked.length} plataformas`
  const typeLabel = ptype && summary ? PTYPES.find(([v]) => v === ptype)?.[1] : undefined

  return (
    <>
      <button
        ref={trigger} type="button" className={`prov-trigger ${picked.length ? 'on' : ''}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        disabled={options.length === 0}
      >
        {picked.length === 0 || !summary ? <Tv size={15} aria-hidden="true" /> : (
          <span className="prov-stack" aria-hidden="true">{picked.slice(0, 3).map((o) => <ProviderLogo key={o.id} info={o} />)}</span>
        )}
        <span className="prov-trigger-label">{label}</span>
        {picked.length > 0 && (summary ? typeLabel && <small>{typeLabel}</small> : <small aria-label={`${picked.length} elegidas`}>{picked.length}</small>)}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <PickerPanel
          anchor={trigger} options={options} selected={selected} onChange={onChange}
          ptype={ptype} onPType={onPType} onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

const isPhone = () => window.matchMedia('(max-width: 599.98px)').matches

function PickerPanel({ anchor, options, selected, onChange, ptype, onPType, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>; options: PickerOption[]; selected: number[]
  onChange: (ids: number[]) => void; ptype: PType; onPType: (t: PType) => void; onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [sheet] = useState(isPhone)
  const [pos, setPos] = useState<CSSProperties>()
  const [query, setQuery] = useState('')
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Anchored under the trigger on wider screens; kept inside the viewport on resize and scroll.
  useLayoutEffect(() => {
    if (sheet) return
    const place = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.min(340, window.innerWidth - 32)
      const left = Math.min(Math.max(16, r.left), window.innerWidth - 16 - width)
      const top = r.bottom + 8
      setPos({ left, top, width, maxHeight: Math.max(220, window.innerHeight - top - 16) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, sheet])

  // Escape and outside clicks close it; focus goes back to the trigger.
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
    // Phones: focus the sheet itself so the on-screen keyboard does not pop up uninvited.
    const first = sheet ? panel.current : panel.current?.querySelector<HTMLElement>('input')
    first?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      if (sheet) document.body.style.overflow = prevOverflow
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || panel.current?.contains(document.activeElement))) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [anchor, sheet])

  const sel = new Set(selected)
  const toggle = (id: number) => {
    const next = new Set(sel)
    if (!next.delete(id)) next.add(id)
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id)) // keep the list order
  }
  const q = norm(query.trim())
  const shown = q ? options.filter((o) => norm(o.name).includes(q)) : options

  const body = (
    <div
      ref={panel} className={`prov-pop ${sheet ? 'sheet' : ''}`} style={sheet ? undefined : pos}
      role="dialog" aria-label="Filtrar por plataforma" tabIndex={-1}
    >
      <div className="prov-pop-head">
        <strong>Plataformas en Argentina</strong>
        {selected.length > 0 && <button type="button" className="btn btn-quiet btn-sm" onClick={() => { onChange([]); onPType('') }}>Limpiar</button>}
      </div>
      {selected.length > 0 && (
        <div className="prov-types" role="group" aria-labelledby="prov-types-label">
          <span id="prov-types-label">Tipo</span>
          {PTYPES.map(([v, l]) => (
            <button key={v || 'any'} type="button" className={`chip ${ptype === v ? 'on' : ''}`} aria-pressed={ptype === v} onClick={() => onPType(v)}>{l}</button>
          ))}
        </div>
      )}
      {options.length > SEARCH_FROM && (
        <input
          type="search" className="prov-search" placeholder="Buscar plataforma" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Buscar plataforma" enterKeyHint="search"
        />
      )}
      <ul className="prov-list">
        {shown.map((o) => (
          <li key={o.id}>
            <label className={`prov-opt ${sel.has(o.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
              <span className="prov-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span>
              <ProviderLogo info={o} />
              <span className="prov-opt-name">{o.name}</span>
              <small aria-label={`${o.count} ${o.count === 1 ? 'título' : 'títulos'}`}>{o.count}</small>
            </label>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted small prov-none">Ninguna plataforma coincide con “{query.trim()}”.</p>}
      {sheet && <button type="button" className="btn btn-primary btn-block prov-done" onClick={onClose}>Listo</button>}
    </div>
  )

  return createPortal(sheet ? <div className="prov-back">{body}</div> : body, document.body)
}
