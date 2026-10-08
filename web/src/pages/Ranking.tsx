import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RankingRow } from '../api'
import { Users } from 'lucide-react'
import { useRanking, useStudios } from '../queries'
import { RankingSkeleton } from '../components/Skeleton'
import Highlights from '../components/Highlights'
import { EmptyState, ErrorState } from '../components/States'

// Visual order of the podium: #2 left, #1 center, #3 right.
const PODIUM_ORDER = [1, 0, 2]

type Kind = 'all' | 'movies' | 'series'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movies', label: 'Películas' },
  { id: 'series', label: 'Series' },
]

/** A ranking row reduced to what the podium and list show. */
interface Entry { tag: string; value: number; big: string; unit: string; avg: number | null; extra?: string }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export default function Ranking() {
  const [tab, setTab] = useState('global') // 'global' or a studio slug
  const [kind, setKind] = useState<Kind>('all')
  const studios = useStudios()
  const { data: rows, error, refetch } = useRanking(tab === 'global' ? undefined : tab) // refetches every 15 s while visible
  const isGlobal = tab === 'global'

  const entries = useMemo<Entry[]>(() => {
    if (!rows) return []
    if (isGlobal) {
      const val = (r: RankingRow) => (kind === 'movies' ? r.moviesWatched : kind === 'series' ? r.seriesWatched : r.watchedCount)
      return [...rows]
        .sort((a, b) => val(b) - val(a) || (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.tag.localeCompare(b.tag))
        .map((r) => ({
          tag: r.tag,
          value: val(r),
          big: String(val(r)),
          unit: kind === 'series' ? plural(val(r), 'serie', 'series') : plural(val(r), 'vista', 'vistas'),
          avg: r.averageScore,
          extra: [
            kind === 'all' ? `${r.moviesWatched} pelis · ${r.seriesWatched} series` : '',
            r.leaderOf > 0 ? `Líder en ${r.leaderOf} ${plural(r.leaderOf, 'estudio', 'estudios')}` : '',
          ].filter(Boolean).join(' · '),
        }))
    }
    return rows.map((r) => ({
      tag: r.tag,
      value: r.percent,
      big: `${r.percent.toFixed(r.percent % 1 === 0 ? 0 : 1)}%`,
      unit: `${r.watchedCount}/${r.totalCount}`,
      avg: r.averageScore,
    }))
  }, [rows, isGlobal, kind])

  const body = () => {
    if (error && !rows) return <ErrorState error={error} onRetry={() => void refetch()} />
    if (!rows) return <RankingSkeleton />
    if (entries.length === 0) return <EmptyState icon={Users} title="Todavía no hay nadie en este ranking">Cuando alguien marque títulos como vistos, aparecerá aquí.</EmptyState>
    const rest = entries.slice(3)
    const max = Math.max(1, ...entries.map((r) => r.value))
    return (
      <>
        {entries.length > 0 && (
          <ol className="podium" aria-label="Podio">
            {PODIUM_ORDER.map((i) => {
              const r = entries[i]
              if (!r) return <li key={i} className="pod pod-empty" aria-hidden="true" />
              return (
                <li key={r.tag} className={`pod pod-${i + 1}`}>
                  <Link to={`/u/${r.tag}`} className="pod-who">{r.tag}</Link>
                  <span className="pod-count"><b>{r.big}</b> {r.unit}</span>
                  {r.extra && <span className="pod-extra">{r.extra}</span>}
                  <span className="pod-avg">{r.avg !== null ? `★ ${r.avg.toFixed(1)}` : '–'}</span>
                  <div className="pod-step"><span className="pod-place">{i + 1}</span></div>
                </li>
              )
            })}
          </ol>
        )}

        {rest.length > 0 && (
          <ol className="ranking" start={4}>
            {rest.map((r, i) => (
              <li key={r.tag}>
                <span className="pos">{i + 4}</span>
                <span className="who-box">
                  <Link to={`/u/${r.tag}`} className="who">{r.tag}</Link>
                  {r.extra && <small>{r.extra}</small>}
                </span>
                <span className="bar-track" aria-hidden="true"><i style={{ width: `${(r.value / max) * 100}%` }} /></span>
                <span className="count">{r.big} <small>{r.unit}</small></span>
                <span className="avg">{r.avg !== null ? `★ ${r.avg.toFixed(1)}` : '–'}</span>
              </li>
            ))}
          </ol>
        )}
      </>
    )
  }

  return (
    <>
      <header className="page-head">
        <h1 className="title">Ranking</h1>
        <p className="lead">Destacados del grupo y quién lleva más títulos vistos.</p>
      </header>

      <Highlights />

      <section aria-labelledby="rk-title">
        <div className="section-head">
          <h2 id="rk-title">{isGlobal ? 'Quién ha visto más' : 'Quién completó más de este estudio'}</h2>
        </div>
        <div className="rk-controls">
          <div className="chip-list" role="group" aria-label="Ranking por estudio">
            <button type="button" className={`chip ${isGlobal ? 'on' : ''}`} aria-pressed={isGlobal} onClick={() => setTab('global')}>Global</button>
            {studios.data?.map((s) => (
              <button key={s.slug} type="button" className={`chip ${tab === s.slug ? 'on' : ''}`} aria-pressed={tab === s.slug} onClick={() => setTab(s.slug)}>{s.name}</button>
            ))}
          </div>
          {isGlobal && (
            <div className="seg seg-sm" role="group" aria-label="Tipo de título">
              {KINDS.map((k) => (
                <button key={k.id} type="button" className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
              ))}
            </div>
          )}
        </div>
        {body()}
      </section>
    </>
  )
}
