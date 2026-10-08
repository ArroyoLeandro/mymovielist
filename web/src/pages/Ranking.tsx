import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RankingRow } from '../api'
import { useRanking, useStudios } from '../queries'
import { RankingSkeleton } from '../components/Skeleton'
import Highlights from '../components/Highlights'

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
  const { data: rows, error } = useRanking(tab === 'global' ? undefined : tab) // refetches every 15 s while visible
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
    if (error && !rows) return <p className="error">{error.message}</p>
    if (!rows) return <RankingSkeleton bare />
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
                <span className="bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></span>
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
      {isGlobal && <Highlights />}

      <h1 className="title">Ranking</h1>
      <p className="muted">{isGlobal ? 'Quién ha visto más.' : 'Quién ha completado más de este estudio.'}</p>

      <nav className="chips rk-tabs" aria-label="Ranking por estudio">
        <button className={isGlobal ? 'on' : ''} onClick={() => setTab('global')}>Global</button>
        {studios.data?.map((s) => (
          <button key={s.slug} className={tab === s.slug ? 'on' : ''} onClick={() => setTab(s.slug)}>{s.name}</button>
        ))}
      </nav>

      {isGlobal && (
        <div className="seg rk-kind" role="group" aria-label="Tipo de título">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
      )}

      {body()}
    </>
  )
}
