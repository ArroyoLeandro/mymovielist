import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Award, Crown, Eye, Film, Star, Tv, Users, type LucideIcon } from 'lucide-react'
import type { RankingRow } from '../api'
import { useAuth } from '../auth'
import { studioPath } from '../lib/paths'
import { useRanking, useStudios } from '../queries'
import Avatar from '../components/Avatar'
import Highlights from '../components/Highlights'
import ScopePicker, { GLOBAL } from '../components/ScopePicker'
import { RankingSkeleton } from '../components/Skeleton'
import { EmptyState, ErrorState } from '../components/States'
import '../ranking.css'

type Kind = 'all' | 'movies' | 'series'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movies', label: 'Películas' },
  { id: 'series', label: 'Series' },
]
const UNITS: Record<Kind, [string, string]> = { all: ['título', 'títulos'], movies: ['película', 'películas'], series: ['serie', 'series'] }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** One secondary stat: icon, number and words around it ("Líder en <b>3</b> estudios"). */
interface Stat { key: string; icon: LucideIcon; value: string; before?: string; after: string }

/** A ranking row reduced to what the podium and the leaderboard show. */
interface Entry { tag: string; value: number; big: string; unit: string; avg: number | null; stats: Stat[] }

function StatText({ s }: { s: Stat }) {
  return <>{s.before && <span className="st-l">{s.before} </span>}<b>{s.value}</b><span className="st-l"> {s.after}</span></>
}

function MeTag() {
  return <span className="me-tag">Tú</span>
}

/** Places 1-3. DOM order is 1, 2, 3 (screen readers); CSS puts #2 left and #3 right. */
function Podium({ top, me }: { top: Entry[]; me: string | undefined }) {
  // Every step reserves the same number of stat lines, so only the lift differs between steps.
  const lines = Math.max(1, ...top.map((e) => e.stats.length))
  return (
    <ol className="podium" style={{ '--lines': lines } as CSSProperties} aria-label="Podio">
      {[0, 1, 2].map((i) => {
        const place = i + 1
        const r = top[i]
        if (!r) {
          return (
            <li key={`free-${place}`} className={`pod pod-${place} pod-free`}>
              <div className="pod-figure"><span className="av pod-av av-free" aria-hidden="true">?</span></div>
              <div className="pod-step">
                <p className="pod-name">Lugar libre</p>
                <p className="pod-count"><b>–</b> <span>sin dueño</span></p>
                <ul className="pod-stats" aria-hidden="true" />
                <span className="pod-place" aria-hidden="true">{place}</span>
              </div>
            </li>
          )
        }
        const mine = r.tag === me
        return (
          <li key={r.tag} className={`pod pod-${place}${mine ? ' is-me' : ''}`}>
            <div className="pod-figure">
              {place === 1 && <Crown className="pod-crown" aria-hidden="true" />}
              <Avatar tag={r.tag} className="pod-av" />
              {mine && <MeTag />}
            </div>
            <div className="pod-step">
              <p className="pod-name">
                <span className="rk-sr">Puesto {place}: </span>
                <Link to={`/u/${r.tag}`}>{r.tag}</Link>
              </p>
              <p className="pod-count"><b>{r.big}</b> <span>{r.unit}</span></p>
              <ul className="pod-stats">
                {r.stats.map((s) => (
                  <li key={s.key} className={`st-${s.key}`}><s.icon size={13} aria-hidden="true" /> <StatText s={s} /></li>
                ))}
              </ul>
              <span className="pod-place" aria-hidden="true">{place}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Places 4+: compact rows, bar relative to the leader. */
function Leaderboard({ rest, max, me, units }: { rest: Entry[]; max: number; me: string | undefined; units: boolean }) {
  return (
    <ol className="lb" start={4} aria-label="Resto del ranking">
      {rest.map((r, i) => {
        const mine = r.tag === me
        const side = r.stats.filter((s) => s.key !== 'avg')
        return (
          <li key={r.tag} className={`lb-row${mine ? ' is-me' : ''}`}>
            <span className="lb-pos">{i + 4}</span>
            <Avatar tag={r.tag} className="lb-av" />
            <div className="lb-who">
              <span className="lb-name"><Link to={`/u/${r.tag}`}>{r.tag}</Link>{mine && <MeTag />}</span>
              {side.length > 0 && (
                <span className="lb-sub">{side.map((s) => <span key={s.key}><StatText s={s} /></span>)}</span>
              )}
            </div>
            <span className="lb-bar" aria-hidden="true">
              <i style={{ width: `${r.value > 0 ? Math.max(3, (r.value / max) * 100) : 0}%` }} />
            </span>
            <span className="lb-count"><b>{r.big}</b>{units && <> <small>{r.unit}</small></>}</span>
            <span className="lb-avg">
              {r.avg !== null && <><Star size={13} aria-hidden="true" /> {r.avg.toFixed(1)}<span className="rk-sr"> de promedio</span></>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function Ranking() {
  const [scope, setScope] = useState(GLOBAL) // GLOBAL or a studio slug
  const [kind, setKind] = useState<Kind>('all')
  const { user } = useAuth()
  const studios = useStudios()
  const isGlobal = scope === GLOBAL
  const { data: rows, error, refetch } = useRanking(isGlobal ? undefined : scope) // refetches every 15 s while visible
  const studio = studios.data?.find((s) => s.slug === scope)
  const studioName = studio?.name ?? 'este estudio'

  const entries = useMemo<Entry[]>(() => {
    if (!rows) return []
    const avgStat = (r: RankingRow): Stat[] =>
      r.averageScore !== null ? [{ key: 'avg', icon: Star, value: r.averageScore.toFixed(1), after: 'de promedio' }] : []
    if (isGlobal) {
      const val = (r: RankingRow) => (kind === 'movies' ? r.moviesWatched : kind === 'series' ? r.seriesWatched : r.watchedCount)
      const [one, many] = UNITS[kind]
      return [...rows]
        .sort((a, b) => val(b) - val(a) || (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.tag.localeCompare(b.tag))
        .map((r) => ({
          tag: r.tag,
          value: val(r),
          big: String(val(r)),
          unit: plural(val(r), one, many),
          avg: r.averageScore,
          stats: [
            ...(kind === 'all'
              ? [
                  { key: 'mov', icon: Film, value: String(r.moviesWatched), after: plural(r.moviesWatched, 'película', 'películas') },
                  { key: 'ser', icon: Tv, value: String(r.seriesWatched), after: plural(r.seriesWatched, 'serie', 'series') },
                ]
              : []),
            ...avgStat(r),
            ...(r.leaderOf > 0 ? [{ key: 'lead', icon: Award, value: String(r.leaderOf), before: 'Líder en', after: plural(r.leaderOf, 'estudio', 'estudios') }] : []),
          ],
        }))
    }
    return rows.map((r) => ({
      tag: r.tag,
      value: r.percent,
      big: `${r.percent.toFixed(r.percent % 1 === 0 ? 0 : 1)}%`,
      unit: 'completado',
      avg: r.averageScore,
      stats: [
        { key: 'seen', icon: Eye, value: String(r.watchedCount), after: `de ${r.totalCount} vistos` },
        ...avgStat(r),
      ],
    }))
  }, [rows, isGlobal, kind])

  const heading = isGlobal
    ? kind === 'all' ? 'Quién vio más' : `Quién vio más ${UNITS[kind][1]}`
    : `Quién completó más de ${studioName}`

  const body = () => {
    if (error && !rows) return <ErrorState error={error} onRetry={() => void refetch()} />
    if (!rows) return <RankingSkeleton />
    if (entries.length === 0) {
      return <EmptyState icon={Users} title="Todavía no hay nadie en este ranking">Cuando alguien del grupo entre y marque títulos como vistos, aparece aquí.</EmptyState>
    }
    const max = Math.max(0, ...entries.map((e) => e.value))
    if (max === 0) {
      const title = isGlobal
        ? kind === 'all' ? 'Nadie marcó títulos como vistos todavía' : `Nadie vio ${UNITS[kind][1]} todavía`
        : `Nadie vio nada de ${studioName} todavía`
      return (
        <EmptyState
          icon={Users}
          title={title}
          action={!isGlobal && studio ? <Link to={studioPath(studio.slug)} className="btn btn-primary btn-sm">Ver el catálogo de {studio.name}</Link> : undefined}
        >
          El primero que marque un título como visto se queda con el primer puesto.
        </EmptyState>
      )
    }
    const me = user?.tag
    const rest = entries.slice(3)
    return (
      <>
        <Podium top={entries.slice(0, 3)} me={me} />
        {rest.length > 0 && <Leaderboard rest={rest} max={max} me={me} units={isGlobal} />}
      </>
    )
  }

  return (
    <>
      <header className="rk-head">
        <h1 className="title">Ranking</h1>
        <div className="rk-controls">
          <ScopePicker value={scope} studios={studios.data} onChange={setScope} />
          {isGlobal && (
            <div className="seg seg-sm" role="group" aria-label="Tipo de título">
              {KINDS.map((k) => (
                <button key={k.id} type="button" className={kind === k.id ? 'on' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="rk-layout">
        <section className="rk-main" aria-labelledby="rk-title">
          <h2 id="rk-title" className="rk-stage-title">{heading}</h2>
          {body()}
        </section>
        <Highlights />
      </div>
    </>
  )
}
