import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { ApiError } from '../api'

export default function Login() {
  const { login } = useAuth()
  const [tag, setTag] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(tag.trim(), password)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401 ? 'Wrong group password.'
        : status === 422 ? 'Tag must be 2-20 characters: letters, digits, _ or -.'
        : 'Could not reach the server. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <h1>Movie<span>Nights</span></h1>
        <p className="muted">Pick your tag, enter the group password, and start ticking off movies. A new tag creates your list.</p>
        <label>
          Your tag
          <input value={tag} onChange={(e) => setTag(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Group password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Enter'}</button>
      </form>
    </div>
  )
}
