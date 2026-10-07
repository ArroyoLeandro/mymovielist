import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import Ranking from './pages/Ranking'
import Profile from './pages/Profile'
import { AppSkeleton } from './components/Skeleton'

// Old links (/studios/:slug) keep working.
function LegacyStudioRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/studio/${slug}`} replace />
}

export default function App() {
  const { user, ready, logout } = useAuth()
  const { pathname } = useLocation()
  if (!ready) return <AppSkeleton />
  if (!user) return <Login />

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
        <NavLink to="/" className="brand" aria-label="MyMovieList, inicio"><img src="/mymovielist.png" alt="MyMovieList" width="163" height="34" /></NavLink>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive || pathname.startsWith('/studio') ? 'active' : '')}>Estudios</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          <NavLink to={`/u/${user.tag}`}>Mi lista</NavLink>
        </nav>
        <button className="ghost" onClick={logout} title={`Sesión iniciada como ${user.tag}`}>Cerrar sesión</button>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/studio/:slug" element={<Catalog />} />
          <Route path="/studios/:slug" element={<LegacyStudioRedirect />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/u/:tag" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}
