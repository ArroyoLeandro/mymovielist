import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Catalog from './pages/Catalog'
import Ranking from './pages/Ranking'
import Profile from './pages/Profile'
import { AppSkeleton } from './components/Skeleton'

export default function App() {
  const { user, ready, logout } = useAuth()
  if (!ready) return <AppSkeleton />
  if (!user) return <Login />

  return (
    <>
      <header className="nav">
        <NavLink to="/" className="brand">Movie<span>Nights</span></NavLink>
        <nav>
          <NavLink to="/studios/disney">Catálogo</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          <NavLink to={`/u/${user.tag}`}>Mi lista</NavLink>
        </nav>
        <button className="ghost" onClick={logout} title={`Sesión iniciada como ${user.tag}`}>Cerrar sesión</button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/studios/disney" replace />} />
          <Route path="/studios/:slug" element={<Catalog />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/u/:tag" element={<Profile />} />
          <Route path="*" element={<Navigate to="/studios/disney" replace />} />
        </Routes>
      </main>
    </>
  )
}
