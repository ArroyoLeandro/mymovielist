import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Catalog from './pages/Catalog'
import Ranking from './pages/Ranking'
import Profile from './pages/Profile'

export default function App() {
  const { user, ready, logout } = useAuth()
  if (!ready) return <div className="splash">Loading…</div>
  if (!user) return <Login />

  return (
    <>
      <header className="nav">
        <NavLink to="/" className="brand">Movie<span>Nights</span></NavLink>
        <nav>
          <NavLink to="/studios/disney">Catalog</NavLink>
          <NavLink to="/ranking">Ranking</NavLink>
          <NavLink to={`/u/${user.tag}`}>My list</NavLink>
        </nav>
        <button className="ghost" onClick={logout} title={`Signed in as ${user.tag}`}>Log out</button>
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
