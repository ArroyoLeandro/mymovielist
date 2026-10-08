import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, CircleAlert, LoaderCircle, Plus, RotateCw, SearchX } from 'lucide-react'
import { ApiError, type TmdbResult } from '../api'
import { useTmdbSearch } from '../queries'
import { resultKey, titleLink, useAddTitle, type AddState } from '../lib/useAddTitle'
import Poster from './Poster'
import { Sk } from './Skeleton'
import '../tmdb.css'

const typeLabel = (r: TmdbResult) => (r.mediaType === 'series' ? 'Serie' : 'Película')

function failText(e: unknown, q: string): string {
  if (e instanceof ApiError && e.code === 'rate_limited') {
    const s = Number(e.data.retryAfter ?? 60)
    return `Hiciste muchas búsquedas seguidas. Espera ${s} s y vuelve a intentarlo.`
  }
  if (e instanceof ApiError && e.code === 'tmdb_unavailable') return 'TMDB no respondió. Inténtalo de nuevo en un momento.'
  return `No se pudo buscar “${q}” en TMDB.`
}

/** What can be done with a TMDB result: open it (already in the catalog), add it, or nothing yet (unreleased). */
function Action({ r, state, onAdd, onNavigate }: { r: TmdbResult; state: AddState | undefined; onAdd: () => void; onNavigate?: () => void }) {
  if (state?.status === 'added') {
    const res = state.result
    return (
      <span className="tmdb-done">
        <span className="tmdb-done-text"><Check size={14} strokeWidth={3} aria-hidden="true" />{res.created ? 'Agregada a' : 'Ya estaba en'} {res.studio.name}</span>
        <Link to={titleLink(res.studio.slug, res.title.id)} className="tmdb-see" data-nav onClick={onNavigate}>Ver<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </span>
    )
  }
  if (r.inCatalog) {
    return (
      <Link to={titleLink(r.inCatalog.studioSlug, r.inCatalog.id)} className="tmdb-see" data-nav onClick={onNavigate}>
        Ya está en el catálogo<ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    )
  }
  if (!r.released) return <span className="tag">Sin estrenar</span>
  if (state?.status === 'adding') {
    return (
      <button type="button" className="btn btn-primary btn-sm tmdb-add is-busy" disabled aria-live="polite" data-nav>
        <LoaderCircle size={14} className="spin" aria-hidden="true" />Agregando…
      </button>
    )
  }
  return (
    <button type="button" className="btn btn-primary btn-sm tmdb-add" onClick={onAdd} data-nav aria-label={`Agregar ${r.title} (${r.year ?? 's/f'}) al catálogo`}>
      {state?.status === 'error' ? <RotateCw size={14} aria-hidden="true" /> : <Plus size={14} strokeWidth={2.5} aria-hidden="true" />}
      {state?.status === 'error' ? 'Reintentar' : 'Agregar'}
    </button>
  )
}

function Meta({ r }: { r: TmdbResult }) {
  return (
    <span className="tmdb-meta">
      <span>{r.year ?? 'Sin fecha'}</span>
      <span className={`tag ${r.mediaType === 'series' ? 'series' : ''}`}>{typeLabel(r)}</span>
    </span>
  )
}

/** TMDB mode of the header search dropdown: compact rows with their action on the right. */
export function TmdbList({ q, onNavigate }: { q: string; onNavigate: () => void }) {
  const search = useTmdbSearch(q)
  const { states, add } = useAddTitle()
  if (search.isPending && search.fetchStatus !== 'idle') {
    return (
      <div aria-busy="true" aria-label="Buscando en TMDB">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tmdb-row" aria-hidden="true">
            <Sk className="tmdb-sk-thumb" />
            <span className="tmdb-info"><Sk className="sk-line" style={{ width: `${70 - i * 8}%` }} /><Sk className="sk-line sm" style={{ width: '35%', marginTop: 6 }} /></span>
            <Sk className="tmdb-sk-btn" />
          </div>
        ))}
      </div>
    )
  }
  if (search.error) {
    return (
      <div className="tmdb-note is-error" role="alert">
        <CircleAlert size={18} aria-hidden="true" />
        <span>{failText(search.error, q)}</span>
        {!(search.error instanceof ApiError && search.error.code === 'rate_limited') && (
          <button type="button" className="btn btn-ghost btn-sm" data-nav onClick={() => void search.refetch()}>Reintentar</button>
        )}
      </div>
    )
  }
  const list = search.data?.results ?? []
  if (list.length === 0) {
    return <p className="tmdb-note"><SearchX size={18} aria-hidden="true" />TMDB tampoco tiene resultados para “{q}”. Prueba con el título original.</p>
  }
  return (
    <ul className="tmdb-list" aria-label={`Resultados de TMDB para “${q}”`}>
      {list.map((r) => {
        const st = states.get(resultKey(r))
        return (
          <li key={resultKey(r)} className={`tmdb-row ${st?.status === 'added' ? 'is-added' : ''}`}>
            <Poster url={r.posterUrl} title={r.title} className="thumb" />
            <span className="tmdb-info">
              <strong>{r.title}</strong>
              {r.originalTitle && <span className="tmdb-orig">{r.originalTitle}</span>}
              <Meta r={r} />
            </span>
            <Action r={r} state={st} onAdd={() => void add(r)} onNavigate={onNavigate} />
          </li>
        )
      })}
    </ul>
  )
}

/** /catalogo with a search that found nothing: the same TMDB results as poster cards. */
export function TmdbPanel({ q }: { q: string }) {
  const search = useTmdbSearch(q)
  const { states, add } = useAddTitle()
  const list = search.data?.results ?? []
  return (
    <section className="tmdb-panel" aria-labelledby="tmdb-panel-title">
      <div className="tmdb-panel-head">
        <SearchX size={26} aria-hidden="true" />
        <div>
          <h2 id="tmdb-panel-title">No encontramos «{q}» en el catálogo</h2>
          <p>Estos son los resultados de TMDB. Si es lo que buscabas, agrégalo y queda disponible para todo el grupo.</p>
        </div>
      </div>
      {search.isPending && search.fetchStatus !== 'idle' ? (
        <div className="tmdb-grid" aria-busy="true" aria-label="Buscando en TMDB">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="tmdb-card" aria-hidden="true">
              <Sk className="sk-poster" /><Sk className="sk-line" style={{ width: '80%' }} /><Sk className="sk-line sm" style={{ width: '45%', marginTop: 6 }} /><Sk className="tmdb-sk-btn wide" />
            </div>
          ))}
        </div>
      ) : search.error ? (
        <div className="tmdb-note is-error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{failText(search.error, q)}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void search.refetch()}>Reintentar</button>
        </div>
      ) : list.length === 0 ? (
        <p className="tmdb-note"><SearchX size={18} aria-hidden="true" />TMDB tampoco tiene resultados. Prueba con el título original o una palabra menos.</p>
      ) : (
        <ul className="tmdb-grid">
          {list.map((r) => {
            const st = states.get(resultKey(r))
            return (
              <li key={resultKey(r)} className={`tmdb-card ${st?.status === 'added' ? 'is-added' : ''}`}>
                <div className="art"><Poster url={r.posterUrl} title={r.title} /></div>
                <strong className="tmdb-card-title">{r.title}</strong>
                <Meta r={r} />
                <Action r={r} state={st} onAdd={() => void add(r)} />
              </li>
            )
          })}
        </ul>
      )}
      <p className="tmdb-credit">Datos de títulos de TMDB.</p>
    </section>
  )
}
