import { Link } from 'react-router-dom'
import StudioLogo from '../components/StudioLogo'
import { studioPath } from '../lib/paths'
import { StudiosSkeleton } from '../components/Skeleton'
import { ErrorState } from '../components/States'
import { useProgress, useStudios } from '../queries'

export default function Studios() {
  const studios = useStudios()
  const progress = useProgress()

  if (studios.error && !studios.data) return <ErrorState error={studios.error} onRetry={() => void studios.refetch()} />
  if (!studios.data) return <StudiosSkeleton />

  const watched = new Map((progress.data ?? []).map((p) => [p.slug, p.watchedCount]))

  return (
    <>
      <header className="page-head">
        <h1 className="title">Estudios</h1>
        <p className="lead">Elige un estudio o una categoría para ver su catálogo.</p>
      </header>
      <div className="studios">
        {studios.data.map((s) => {
          const seen = watched.get(s.slug) ?? 0
          const pct = s.movieCount ? Math.round((seen / s.movieCount) * 100) : 0
          return (
            <Link key={s.slug} to={studioPath(s.slug)} className="studio-card">
              <StudioLogo name={s.name} url={s.logoUrl} />
              <h2>{s.name}</h2>
              <p className="muted">{s.movieCount} {s.movieCount === 1 ? 'título' : 'títulos'}</p>
              <div className="meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
              <p className="studio-progress">{progress.data ? <><b>{seen}</b> {seen === 1 ? 'vista' : 'vistas'} · {pct}%</> : ' '}</p>
            </Link>
          )
        })}
      </div>
    </>
  )
}
