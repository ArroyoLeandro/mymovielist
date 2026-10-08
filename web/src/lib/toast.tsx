import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleCheck, X } from 'lucide-react'

/** App-wide toasts (bottom center): a short message, an optional link, auto-dismissed. */
export interface Toast {
  id: number
  tone: 'ok' | 'error'
  text: string
  link?: { to: string; label: string }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(t: Omit<Toast, 'id'>, ms = 6000) {
  const id = nextId++
  toasts = [...toasts.slice(-2), { ...t, id }] // at most three at once
  emit()
  setTimeout(() => dismissToast(id), ms)
  return id
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.tone === 'ok' ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
          <span>{t.text}</span>
          {t.link && <Link to={t.link.to} className="toast-link" onClick={() => dismissToast(t.id)}>{t.link.label}</Link>}
          <button type="button" className="btn btn-quiet btn-icon toast-x" aria-label="Cerrar aviso" onClick={() => dismissToast(t.id)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
