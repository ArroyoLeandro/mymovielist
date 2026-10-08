import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { SCORE_LABELS } from '../lib/scores'

const KEY_COMMIT_MS = 450

/**
 * 1-10 segmented meter. Hover or drag previews the fill, tap commits, tapping the current score clears it.
 * Keyboard: arrows / Home / End move, digits set (0 = 10), Delete or Backspace clears.
 */
export default function ScoreMeter({ value, onChange, disabled = false }: {
  value: number | null
  onChange: (n: number | null) => void
  disabled?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<number | null>(null) // pointer hover / drag
  const [draft, setDraft] = useState<number | null | undefined>(undefined) // keyboard value awaiting commit
  const drag = useRef<{ start: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ draft, onChange })
  latest.current = { draft, onChange }

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const { draft: d, onChange: cb } = latest.current
    if (d !== undefined) {
      setDraft(undefined)
      cb(d)
    }
  }, [])
  useEffect(() => () => flush(), [flush])
  useEffect(() => { setDraft((d) => (d === value ? undefined : d)) }, [value])

  const shown = preview ?? (draft === undefined ? value : draft)

  const at = (e: PointerEvent) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width === 0) return 1
    return Math.min(10, Math.max(1, Math.ceil(((e.clientX - box.left) / box.width) * 10)))
  }

  const down = (e: PointerEvent) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    flush()
    const n = at(e)
    drag.current = { start: n }
    setPreview(n)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (disabled) return
    if (drag.current || e.pointerType === 'mouse') setPreview(at(e))
  }
  const up = (e: PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const n = at(e)
    setPreview(null)
    // A tap (press and release on the same segment) on the current score clears it; a drag always sets.
    onChange(n === value && n === d.start ? null : n)
  }
  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  const key = (e: KeyboardEvent) => {
    if (disabled || e.ctrlKey || e.metaKey || e.altKey) return
    const cur = draft === undefined ? value : draft
    let next: number | null | undefined
    if (/^[0-9]$/.test(e.key)) next = e.key === '0' ? 10 : Number(e.key)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(10, (cur ?? 0) + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, (cur ?? 2) - 1)
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = 10
    else if (e.key === 'Delete' || e.key === 'Backspace') next = null
    if (next === undefined) return
    e.preventDefault()
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, KEY_COMMIT_MS)
  }

  return (
    <div className={`meter-wrap ${disabled ? 'disabled' : ''}`}>
      <p className="meter-read" aria-hidden="true">
        <strong key={shown ?? 'none'} className={shown ? 'pop' : 'none'}>{shown ?? '–'}</strong>
        <span>{shown ? SCORE_LABELS[shown - 1] : 'Toca para puntuar'}</span>
      </p>
      <div
        ref={track}
        className="score-meter"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Tu puntaje"
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value ? `${value} de 10: ${SCORE_LABELS[value - 1]}` : 'Sin puntaje'}
        aria-disabled={disabled}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onPointerLeave={() => !drag.current && setPreview(null)}
        onKeyDown={key}
        onBlur={flush}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <i
            key={n}
            className={`${shown !== null && n <= shown ? 'fill' : ''} ${n === shown ? 'peak' : ''}`}
            style={{ '--p': `${((n - 1) / 9) * 100}%` } as CSSProperties}
          >
            {n}
          </i>
        ))}
      </div>
      <p className="meter-hint">{value ? 'Toca de nuevo tu puntaje para quitarlo' : 'Desliza o usa las flechas del teclado'}</p>
    </div>
  )
}
