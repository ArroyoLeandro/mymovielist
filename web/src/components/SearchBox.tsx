import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import Poster from './Poster'
import { useSearch } from '../queries'

/** Header search across all catalogs: debounced, grouped dropdown, Enter opens the full results grid. */
export default function SearchBox() {
  const nav = useNavigate()
  const { pathname, search: urlSearch } = useLocation()
  const [value, setValue] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false) // phones: the box collapses to an icon
  const box = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 250)
    return () => clearTimeout(t)
  }, [value])

  const results = useSearch(q)

  // Close on navigation, outside click and Escape.
  useEffect(() => {
    setOpen(false)
    setExpanded(false)
  }, [pathname, urlSearch])
  useEffect(() => {
    const out = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false)
        setExpanded(false)
      }
    }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = value.trim()
    if (!term) return
    setOpen(false)
    input.current?.blur()
    nav(`/catalogo?q=${encodeURIComponent(term)}`)
  }

  const show = open && q.length >= 2
  const list = results.data ?? []

  return (
    <form className={`search ${expanded ? 'expanded' : ''}`} ref={box} role="search" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && (setOpen(false), setExpanded(false))}>
      <button
        type="button"
        className="search-toggle ghost"
        aria-label="Buscar"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(true)
          setOpen(true)
          requestAnimationFrame(() => input.current?.focus())
        }}
      >
        <Search size={18} aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="search"
        value={value}
        placeholder="Buscar en todo el catálogo"
        aria-label="Buscar en todo el catálogo"
        autoComplete="off"
        onChange={(e) => { setValue(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {show && (
        <div className="search-drop" role="listbox" aria-label="Resultados">
          {results.isFetching && list.length === 0 && <p className="muted search-note">Buscando…</p>}
          {!results.isFetching && list.length === 0 && <p className="muted search-note">Sin resultados para “{q}”.</p>}
          {list.map((t) => (
            <Link key={t.id} to={`/studio/${t.studio.slug}?t=${t.id}`} className="search-item" role="option">
              <Poster url={t.posterUrl} title={t.title} className="thumb" />
              <span className="info">
                <strong>{t.title}</strong>
                <span className="muted">{t.year}{t.mediaType === 'series' ? ' · Serie' : ''}</span>
              </span>
              <span className="search-tags">
                <span className="tag studio">{t.studio.name}</span>
                {t.state.watched ? <span className="tag ok">Vista ✓</span> : t.state.pending ? <span className="tag">Pendiente</span> : null}
              </span>
            </Link>
          ))}
          {list.length > 0 && (
            <Link to={`/catalogo?q=${encodeURIComponent(q)}`} className="search-all">Ver todos los resultados</Link>
          )}
        </div>
      )}
    </form>
  )
}
