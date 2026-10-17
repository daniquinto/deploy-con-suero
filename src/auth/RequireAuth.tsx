import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Role } from '../types'
import { homeFor, useAuth } from './AuthContext'

/** Protege una ruta: sin sesión manda a /ingresar y luego vuelve aquí. */
export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted center">Cargando…</p>
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />

  return <>{children}</>
}
