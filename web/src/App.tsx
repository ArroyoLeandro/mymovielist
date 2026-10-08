import { useLayoutEffect, useRef } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from './auth'
import Login from './pages/Login'
import Home from './pages/Home'
import Studios from './pages/Studios'
import Browse from './pages/Browse'
import Catalog from './pages/Catalog'
import Ranking from './pages/Ranking'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import { Toaster } from './lib/toast'
import { AppSkeleton } from './components/Skeleton'
import SearchBox from './components/SearchBox'
import { BackButton, ScrollManager, ToTopButton } from './components/Scroll'

// Old links (/studios/:slug) keep working.
function LegacyStudioRedirect() {
  const { slug = '' } = useParams()
  return <Navigate to={`/studio/${slug}`} replace />
}

/** Publishes the sticky header's height as --header-h (it changes across breakpoints). */
function useHeaderHeight(mounted: boolean) {
  const header = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = header.current
    if (!el) return
    const root = document.documentElement.style
    const ro = new ResizeObserver(() => root.setProperty('--header-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted])
  return header
}

export default function App() {
  const { user, ready, logout } = useAuth()
  const { pathname } = useLocation()
  const header = useHeaderHeight(ready && !!user)
  if (!ready) return <AppSkeleton />
  if (!user) return <Login />

  return (
    <>
      <header className="nav" ref={header}>
        <div className="nav-inner">
          <NavLink to="/" className="brand" aria-label="MyMovieList, inicio"><img src="/mymovielist.png" alt="MyMovieList" width="163" height="34" /></NavLink>
          <nav className="nav-links" aria-label="Principal">
            <NavLink to="/" end>Inicio</NavLink>
            <NavLink to="/catalogo">Catálogo</NavLink>
            <NavLink to="/estudios" className={({ isActive }) => (isActive || pathname.startsWith('/studio/') ? 'active' : '')}>Estudios</NavLink>
            <NavLink to="/ranking">Ranking</NavLink>
            <NavLink to={`/u/${user.tag}`}>Mi perfil</NavLink>
          </nav>
          <SearchBox />
          <button type="button" className="btn btn-ghost nav-logout" onClick={logout} title={`Sesión iniciada como ${user.tag}`}>
            <LogOut size={16} aria-hidden="true" /><span className="nav-logout-label">Cerrar sesión</span>
          </button>
        </div>
      </header>
      <ScrollManager />
      <main className="page">
        <BackButton />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/estudios" element={<Studios />} />
          <Route path="/catalogo" element={<Browse />} />
          <Route path="/studio/:slug" element={<Catalog />} />
          <Route path="/studios/:slug" element={<LegacyStudioRedirect />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/u/:tag" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ToTopButton />
      <Toaster />
    </>
  )
}
