import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth'
import GridSection from '../components/GridSection'
import LiveCard from '../components/LiveCard'
import Poster from '../components/Poster'
import { RowsSkeleton } from '../components/Skeleton'
import { ErrorState } from '../components/States'
import { useHome } from '../queries'

/** Items per home section: two full rows at five columns. CSS (.grid.capped) trims to whole rows on narrower screens. */
const HOME_LIMIT = 10

/** Global catalog home: themed sections built by GET /api/home, each a short grid with a "Ver todo" link. */
export default function Home() {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const home = useHome()

  return (
    <>
      <header className="page-head">
        <h1 className="title">Inicio</h1>
        <p className="lead">Lo que está viendo el grupo, y lo que viene.</p>
      </header>
      {home.error && !home.data ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      ) : !home.data ? (
        <RowsSkeleton />
      ) : (
        home.data.rows.filter((row) => row.items.length > 0).map((row) => {
          const link = row.link?.replace('/u/me', `/u/${me}`)
          const action = link && (
            <Link to={link} className="section-action" aria-label={`Ver todo: ${row.title}`}>
              Ver todo <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )
          return (
            <GridSection key={row.key} name={row.title} action={action} capped>
              {row.kind === 'sagas'
                ? row.items.slice(0, HOME_LIMIT).map((s) => (
                    <Link key={s.slug} to={`/studio/${s.studioSlug}?tab=sagas&saga=${s.slug}`} className="card saga-card">
                      <div className="art"><Poster url={s.posterUrl} title={s.name} /></div>
                      <h3>{s.name}</h3>
                      <p className="year">{s.seen}/{s.total} vistas</p>
                      <div className="meter" aria-hidden="true"><i style={{ width: `${s.total ? (s.seen / s.total) * 100 : 0}%` }} /></div>
                    </Link>
                  ))
                : row.items.slice(0, HOME_LIMIT).map((t) => <LiveCard key={t.id} item={t} me={me} showStudio />)}
            </GridSection>
          )
        })
      )}
    </>
  )
}
