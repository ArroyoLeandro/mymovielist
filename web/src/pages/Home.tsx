import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth'
import LiveCard from '../components/LiveCard'
import Poster from '../components/Poster'
import SagaRow from '../components/SagaRow'
import { RowsSkeleton } from '../components/Skeleton'
import { useHome } from '../queries'

/** Global catalog home: themed horizontal rows built by GET /api/home. */
export default function Home() {
  const { user } = useAuth()
  const me = user?.tag ?? ''
  const home = useHome()

  if (home.error && !home.data) return <p className="error">{home.error.message}</p>

  return (
    <>
      <h1 className="title">Inicio</h1>
      <p className="muted">Lo que está viendo el grupo, y lo que viene.</p>
      {!home.data ? (
        <RowsSkeleton rows={4} />
      ) : (
        home.data.rows.map((row) => {
          const link = row.link?.replace('/u/me', `/u/${me}`)
          const action = link && <Link to={link}>Ver todo <ArrowRight size={14} aria-hidden="true" /></Link>
          return row.kind === 'sagas' ? (
            <SagaRow key={row.key} name={row.title} action={action}>
              {row.items.map((s) => (
                <Link key={s.slug} to={`/studio/${s.studioSlug}?saga=${s.slug}`} className="card saga-card">
                  <div className="art"><Poster url={s.posterUrl} title={s.name} /></div>
                  <h3>{s.name}</h3>
                  <p className="year">{s.seen}/{s.total} vistas</p>
                  <div className="meter"><i style={{ width: `${s.total ? (s.seen / s.total) * 100 : 0}%` }} /></div>
                </Link>
              ))}
            </SagaRow>
          ) : (
            <SagaRow key={row.key} name={row.title} action={action}>
              {row.items.map((t) => <LiveCard key={t.id} item={t} me={me} showStudio />)}
            </SagaRow>
          )
        })
      )}
    </>
  )
}
