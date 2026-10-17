import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HandHeart, LayoutDashboard, LogOut, PlusCircle, ReceiptText, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { isDemoMode } from '../services/api'
import { Logo } from './Logo'
import { initials } from './ui'

/** Rutas que dibujan su propio lienzo a pantalla completa. */
const FULL_BLEED = ['/ingresar', '/registro']

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const fullBleed = FULL_BLEED.includes(pathname)

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const profilePath = user?.role === 'foundation' ? '/mi-fundacion' : '/mi-perfil'

  return (
    <div className="app">
      {isDemoMode && (
        <div className="demo-banner">Modo demo: los datos se guardan solo en este navegador y no se mueve dinero real.</div>
      )}

      <header className="header">
        <div className="container header-row">
          <Link to="/" className="brand" aria-label="Mano Abierta, inicio"><Logo /></Link>

          <nav className="nav" aria-label="Principal">
            {user?.role === 'foundation' ? (
              <>
                <NavLink to="/mi-fundacion" end><LayoutDashboard aria-hidden />Mis causas</NavLink>
                <NavLink to="/mi-fundacion/causas/nueva"><PlusCircle aria-hidden />Crear causa</NavLink>
                <NavLink to="/causas" end><Search aria-hidden />Causas públicas</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/causas" end><HandHeart aria-hidden />Causas</NavLink>
                <NavLink to="/mis-donaciones"><ReceiptText aria-hidden />Mis donaciones</NavLink>
              </>
            )}
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <Link to={profilePath} className="user-chip" title="Mi perfil">
                  <span className="avatar" aria-hidden>{initials(user.name)}</span>
                  <span className="who">
                    <span className="strong small">{user.name}</span>
                    <span>{user.role === 'foundation' ? 'Fundación' : 'Donante'}</span>
                  </span>
                </Link>
                <button type="button" className="btn btn-quiet icon-btn" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut aria-hidden />
                </button>
              </>
            ) : (
              <>
                <Link to="/ingresar" className="btn btn-quiet">Ingresar</Link>
                <Link to="/registro" className="btn btn-primary">Crear cuenta</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {fullBleed ? (
        <Outlet />
      ) : (
        <main className="container main">
          <Outlet />
        </main>
      )}

      {!fullBleed && (
        <footer className="footer">
          <div className="container footer-row">
            <Logo />
            <nav className="footer-links" aria-label="Pie de página">
              <Link to="/causas">Causas activas</Link>
              <Link to="/registro?tipo=fundacion">Registrar una fundación</Link>
              <Link to="/gobierno">Vista entidad gubernamental</Link>
              <Link to="/admin">Vista administrador</Link>
            </nav>
            <span className="muted small">Ayuda que llega hoy. Y lo puedes ver.</span>
          </div>
        </footer>
      )}
    </div>
  )
}
