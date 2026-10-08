import type { ReactNode } from 'react'
import { CircleAlert, RotateCw, type LucideIcon } from 'lucide-react'

/** Friendly empty state: what is missing and what to do next. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <Icon size={28} aria-hidden="true" />
      <p className="state-title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

/** Load failure with the server's reason and a retry. */
export function ErrorState({ error, onRetry }: { error: Error | null | undefined; onRetry?: () => void }) {
  return (
    <div className="state is-error" role="alert">
      <CircleAlert size={28} aria-hidden="true" />
      <p className="state-title">No se pudo cargar esta página</p>
      <p>{error?.message ?? 'Revisa tu conexión e inténtalo de nuevo.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Reintentar
        </button>
      )}
    </div>
  )
}
