import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Globe, Search, X } from 'lucide-react'
import Poster from './Poster'
import { TmdbList } from './TmdbResults'
import { titleType } from '../lib/titleType'
import { useSearch } from '../queries'

/** Few local results: the TMDB action row is promoted (shown before "Ver todos los resultados"). */
const FEW = 3

/**
 * Header search across all catalogs: debounced, grouped dropdown, Enter opens the full results grid.
 * A secondary "Buscar en TMDB" row switches the dropdown to TMDB mode, where missing titles can be added.
 * Arrow keys move through the dropdown; Escape leaves TMDB mode first, then closes.
 */
export default function SearchBox() {
  const nav = useNavigate()
  const { pathname, search: urlSearch } = useLocation()
  const [value, setValue] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [tmdb, setTmdb] = useState(false)
  const [expanded, setExpanded] = useState(false) // phones: the box collapses to an icon
  const box = useRef<HTMLFormElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const drop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), tmdb ? 450 : 250) // TMDB searches are rate limited: wait longer
    return () => clearTimeout(t)
  }, [value, tmdb])

  const results = useSearch(tmdb ? '' : q)

  const close = () => {
    setOpen(false)
    setExpanded(false)
    setTmdb(false)
  }
  // Close on navigation, outside click and Escape.
  useEffect(() => {
    close()
  }, [pathname, urlSearch])
  useEffect(() => {
    const out = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const term = value.trim()
    if (!term || tmdb) return
    setOpen(false)
    input.current?.blur()
    nav(`/catalogo?q=${encodeURIComponent(term)}`)
  }

  const enterTmdb = () => {
    setTmdb(true)
    requestAnimationFrame(() => drop.current?.querySelector<HTMLElement>('.tmdb-back')?.focus())
  }
  const leaveTmdb = () => {
    setTmdb(false)
    input.current?.focus()
  }

  // Keyboard: ArrowDown/ArrowUp walk the input and every actionable row of the dropdown.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      if (tmdb) leaveTmdb()
      else close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(drop.current?.querySelectorAll<HTMLElement>('[data-nav]:not(:disabled)') ?? [])
    if (!items.length) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[Math.min(at + 1, items.length - 1)].focus()
    else if (at <= 0) input.current?.focus()
    else items[at - 1].focus()
  }

  const show = open && q.length >= 2
  const list = results.data ?? []
  const settled = !results.isFetching || list.length > 0
  const tmdbRow = (
    <button type="button" className={`search-tmdb ${list.length <= FEW ? 'is-promoted' : ''}`} data-nav onClick={enterTmdb}>
      <Globe size={18} aria-hidden="true" />
      <span><strong>¿No lo encuentras? Buscar en TMDB</strong><small>Agrega al catálogo lo que falte</small></span>
    </button>
  )

  return (
    <form className={`search ${expanded ? 'expanded' : ''}`} ref={box} role="search" onSubmit={submit} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="btn btn-ghost btn-icon search-toggle"
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
      <div className="search-field">
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={value}
          placeholder={tmdb ? 'Buscar en TMDB' : 'Buscar en todo el catálogo'}
          aria-label={tmdb ? 'Buscar en TMDB' : 'Buscar en todo el catálogo'}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => { setValue(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      <button type="button" className="btn btn-quiet btn-icon search-close" aria-label="Cerrar la búsqueda" onClick={close}>
        <X size={18} aria-hidden="true" />
      </button>
      {show && (
        <div className={`search-drop ${tmdb ? 'is-tmdb' : ''}`} ref={drop} role="region" aria-label={tmdb ? 'Resultados de TMDB' : 'Resultados de la búsqueda'} aria-live="polite">
          {tmdb ? (
            <>
              <div className="tmdb-head">
                <button type="button" className="tmdb-back" data-nav onClick={leaveTmdb}>
                  <ArrowLeft size={16} aria-hidden="true" />Catálogo
                </button>
                <span className="tmdb-source">Resultados de TMDB</span>
              </div>
              <TmdbList q={q} onNavigate={close} />
            </>
          ) : (
            <>
              {results.isFetching && list.length === 0 && <p className="muted search-note">Buscando…</p>}
              {!results.isFetching && list.length === 0 && <p className="muted search-note">Sin resultados para “{q}” en el catálogo.</p>}
              {settled && list.length <= FEW && tmdbRow}
              {list.map((t) => (
                <Link key={t.id} to={`/studio/${t.studio.slug}?t=${t.id}`} className="search-item" data-nav>
                  <Poster url={t.posterUrl} title={t.title} className="thumb" />
                  <span className="info">
                    <strong>{t.title}</strong>
                    <span className="muted">{[t.year, titleType(t)?.label].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="search-tags">
                    <span className="tag studio">{t.studio.name}</span>
                    {t.state.watched ? <span className="tag ok">Vista ✓</span> : t.state.pending ? <span className="tag">Pendiente</span> : null}
                  </span>
                </Link>
              ))}
              {list.length > FEW && tmdbRow}
              {list.length > 0 && (
                <Link to={`/catalogo?q=${encodeURIComponent(q)}`} className="search-all" data-nav>Ver todos los resultados</Link>
              )}
            </>
          )}
        </div>
      )}
    </form>
  )
}
