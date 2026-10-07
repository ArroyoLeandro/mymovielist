import { Link } from 'react-router-dom'
import StudioLogo from '../components/StudioLogo'
import { HomeSkeleton } from '../components/Skeleton'
import { useProgress, useStudios } from '../queries'

export default function Home() {
  const studios = useStudios()
  const progress = useProgress()

  if (studios.error && !studios.data) return <p className="error">{studios.error.message}</p>
  if (!studios.data) return <HomeSkeleton />

  const watched = new Map((progress.data ?? []).map((p) => [p.slug, p.watchedCount]))

  return (
    <>
      <h1 className="title">Estudios</h1>
      <p className="muted">Elige un estudio para ver su catálogo.</p>
      <div className="studios">
        {studios.data.map((s) => {
          const seen = watched.get(s.slug) ?? 0
          const pct = s.movieCount ? Math.round((seen / s.movieCount) * 100) : 0
          return (
            <Link key={s.slug} to={`/studio/${s.slug}`} className="studio-card">
              <StudioLogo name={s.name} url={s.logoUrl} />
              <h2>{s.name}</h2>
              <p className="muted">{s.movieCount} {s.movieCount === 1 ? 'título' : 'títulos'}</p>
              <div className="meter"><i style={{ width: `${pct}%` }} /></div>
              <p className="studio-progress">{progress.data ? `${seen} vistas · ${pct}%` : ' '}</p>
            </Link>
          )
        })}
      </div>
    </>
  )
}
