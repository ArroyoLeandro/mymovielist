import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useUsers } from '../queries'

const MAX_NOTE = 280

/** Small dialog to recommend a title to one or more friends, with an optional note. */
export default function RecommendModal({ movieId, title, onClose }: { movieId: number; title: string; onClose: () => void }) {
  const { user } = useAuth()
  const users = useUsers()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<string[] | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const friends = (users.data ?? []).filter((t) => t.toLowerCase() !== user?.tag.toLowerCase())
  const toggle = (tag: string) => setPicked((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]))

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      setSent((await api.recommend(movieId, picked, note)).sentTo)
    } catch {
      setError('No se pudo enviar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Recomendar ${title}`} ref={dialog} tabIndex={-1}>
        <h2>Recomendar</h2>
        <p className="muted modal-sub">{title}</p>
        {sent ? (
          <>
            <p className="ok" role="status">Enviada a {sent.map((t) => `@${t}`).join(', ')}.</p>
            <div className="modal-actions"><button className="primary" onClick={onClose}>Listo</button></div>
          </>
        ) : (
          <>
            <p className="modal-label">¿A quién?</p>
            {users.isLoading && <p className="muted">Cargando amigos…</p>}
            {!users.isLoading && friends.length === 0 && <p className="muted">Aún no hay otros usuarios.</p>}
            <div className="friend-chips" role="group" aria-label="Amigos">
              {friends.map((t) => (
                <button key={t} type="button" className={picked.includes(t) ? 'on' : ''} aria-pressed={picked.includes(t)} onClick={() => toggle(t)}>
                  @{t}
                </button>
              ))}
            </div>
            <label className="modal-label">
              Nota (opcional)
              <textarea
                value={note}
                maxLength={MAX_NOTE}
                rows={3}
                placeholder="Por qué crees que le va a gustar…"
                onChange={(e) => setNote(e.target.value)}
              />
              <small className="counter">{note.length}/{MAX_NOTE}</small>
            </label>
            {error && <p className="error small">{error}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={onClose}>Cancelar</button>
              <button className="primary" disabled={busy || picked.length === 0} onClick={() => void send()}>
                {busy ? 'Enviando…' : picked.length > 1 ? `Enviar a ${picked.length}` : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
