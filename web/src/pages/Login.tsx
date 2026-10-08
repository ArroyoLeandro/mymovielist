import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { ApiError } from '../api'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
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
      navigate('/', { replace: true })
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401 ? 'Contraseña del grupo incorrecta.'
        : status === 422 ? 'La etiqueta debe tener de 2 a 20 caracteres: letras, números, _ o -.'
        : 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <h1><img className="login-logo" src="/mymovielist.png" alt="MyMovieList" width="280" height="58" /></h1>
        <p className="muted">Elige tu etiqueta, escribe la contraseña del grupo y empieza a marcar lo que has visto. Una etiqueta nueva crea tu lista.</p>
        <label>
          Tu etiqueta
          <input value={tag} onChange={(e) => setTag(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required />
        </label>
        <label>
          Contraseña del grupo
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
