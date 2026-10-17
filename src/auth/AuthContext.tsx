import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../services/api'
import type { RegisterInput, Role, User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string, role?: Role) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  /** Vuelve a leer el usuario (p. ej. tras editar el perfil). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.currentUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string, role?: Role) => {
    const next = await api.login(email, password, role)
    setUser(next)
    return next
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const next = await api.register(input)
    setUser(next)
    return next
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    setUser(await api.currentUser())
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/** A dónde va cada rol después de entrar. */
export function homeFor(user: User): string {
  return user.role === 'foundation' ? '/mi-fundacion' : '/causas'
}
