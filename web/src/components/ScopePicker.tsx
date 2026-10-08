import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Globe, Search } from 'lucide-react'
import type { Studio } from '../api'
import StudioLogo from './StudioLogo'

/** Scope value for "every studio". */
export const GLOBAL = 'global'

interface Option { slug: string; name: string; logoUrl: string | null }

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function Mark({ option }: { option: Option }) {
  return (
    <span className="picker-mark" aria-hidden="true">
      {option.slug === GLOBAL ? <Globe size={15} /> : <StudioLogo name={option.name} url={option.logoUrl} className="mini" />}
    </span>
  )
}

/**
 * Searchable single-select for the ranking scope: a button that opens a popover with a filter
 * field (combobox) and a listbox. Arrows move, Enter picks, Escape closes and returns focus.
 */
export default function ScopePicker({ value, studios, onChange }: { value: string; studios: Studio[] | undefined; onChange: (slug: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()

  const options = useMemo<Option[]>(
    () => [{ slug: GLOBAL, name: 'Global', logoUrl: null }, ...(studios ?? []).map((s) => ({ slug: s.slug, name: s.name, logoUrl: s.logoUrl }))],
    [studios],
  )
  const shown = useMemo(() => {
    const q = fold(query.trim())
    return q ? options.filter((o) => fold(o.name).includes(q)) : options
  }, [options, query])
  const current = options.find((o) => o.slug === value) ?? options[0]
  const optionId = (o: Option) => `${id}-opt-${o.slug}`

  const openList = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.slug === value)))
    setOpen(true)
  }
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }
  const choose = (o: Option) => {
    onChange(o.slug)
    close(true)
  }

  useEffect(() => { if (open) input.current?.focus() }, [open])

  // A pointer press anywhere outside closes the popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the active option visible while moving with the keyboard.
  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="picker" ref={root}>
      <button
        ref={button}
        type="button"
        className="picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openList() } }}
      >
        <Mark option={current} />
        <span className="picker-label"><span className="rk-sr">Estudio: </span>{current.name}</span>
        <ChevronDown size={16} className="picker-chev" aria-hidden="true" />
      </button>

      {open && (
        <div className="picker-pop">
          <div className="picker-search">
            <Search size={15} aria-hidden="true" />
            <input
              ref={input}
              type="text"
              role="combobox"
              aria-label="Buscar estudio"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={shown[active] ? optionId(shown[active]) : undefined}
              placeholder="Buscar estudio"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onInputKey}
            />
          </div>
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Ranking por estudio" className="picker-list">
            {shown.map((o, i) => (
              <li
                key={o.slug}
                id={optionId(o)}
                role="option"
                aria-selected={o.slug === value}
                data-active={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <Mark option={o} />
                <span className="picker-name">{o.name}</span>
                {o.slug === value && <Check size={15} className="picker-check" aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="picker-none">Ningún estudio coincide con «{query.trim()}».</p>}
        </div>
      )}
    </div>
  )
}
