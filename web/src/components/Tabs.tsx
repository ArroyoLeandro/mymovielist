import { useRef, type KeyboardEvent } from 'react'

export type TabItem<T extends string> = { id: T; label: string; count?: number; countLabel?: string }

/** Content tabs (ARIA tablist): roving focus, arrows / Home / End move and select. */
export default function Tabs<T extends string>({ label, items, value, onChange, className = '' }: {
  label: string; items: TabItem<T>[]; value: T | undefined; onChange: (id: T) => void; className?: string
}) {
  const list = useRef<HTMLDivElement>(null)
  const key = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
    if (next === null || items.length === 0) return
    e.preventDefault()
    const t = items[(next + items.length) % items.length]
    onChange(t.id)
    list.current?.querySelector<HTMLElement>(`[data-tab="${t.id}"]`)?.focus()
  }
  return (
    <div className={`seg tabs ${className}`} role="tablist" aria-label={label} ref={list} onKeyDown={key}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          aria-label={t.countLabel ? `${t.label}, ${t.countLabel}` : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}{t.count !== undefined && <small aria-hidden={t.countLabel ? true : undefined}>{t.count}</small>}
        </button>
      ))}
    </div>
  )
}
