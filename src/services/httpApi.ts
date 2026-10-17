/**
 * Implementación REAL del API: habla con el backend (rama `backend`).
 * Expone las mismas funciones que mockApi para que las páginas no cambien.
 *
 * Sesión: el backend devuelve un JWT que se guarda en localStorage y se envía
 * como `Authorization: Bearer <token>`.
 */
import type {
  Cause,
  CauseInput,
  CauseStatus,
  Donation,
  DonorProfile,
  DonorProfileUpdate,
  Foundation,
  Quote,
  RegisterInput,
  Role,
  User,
} from '../types'
import type { mockApi } from './mockApi'

const BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`
const TOKEN_KEY = 'ma.token'

const getToken = () => localStorage.getItem(TOKEN_KEY)
const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Intenta de nuevo en un momento.', 0)
  }

  // 204 No Content (cambiar contraseña, eliminar cuenta) no trae cuerpo.
  const body = (res.status === 204 ? null : await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) {
    if (res.status === 401) setToken(null)
    throw new ApiError(body?.error ?? `Error ${res.status} del servidor.`, res.status)
  }
  return body as T
}

/** Devuelve null en vez de lanzar cuando el recurso no existe. */
async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

const notYet = () =>
  Promise.reject(new Error('Las donaciones todavía no están conectadas al backend. Usa el modo demo para probarlas.'))

export const httpApi: typeof mockApi = {
  // ── Sesión ─────────────────────────────────────────────────────────
  async register(input: RegisterInput): Promise<User> {
    const { token, user } = await request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setToken(token)
    return user
  },

  async login(email: string, password: string, role?: Role): Promise<User> {
    const { token, user } = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (role && user.role !== role) {
      throw new ApiError(
        user.role === 'foundation'
          ? 'Esta cuenta es de una fundación. Elige «Soy fundación» para ingresar.'
          : 'Esta cuenta es de un donante. Elige «Soy donante» para ingresar.',
        400,
      )
    }
    setToken(token)
    return user
  },

  async logout(): Promise<void> {
    setToken(null)
  },

  async currentUser(): Promise<User | null> {
    if (!getToken()) return null
    try {
      return (await request<{ user: User }>('/auth/me')).user
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null
      throw err
    }
  },

  // ── Perfil del donante ─────────────────────────────────────────────
  async getMyDonorProfile(): Promise<DonorProfile> {
    return (await request<{ donor: DonorProfile }>('/donors/me')).donor
  },

  async updateMyDonorProfile(changes: DonorProfileUpdate): Promise<DonorProfile> {
    return (await request<{ donor: DonorProfile }>('/donors/me', { method: 'PATCH', body: JSON.stringify(changes) })).donor
  },

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await request<null>('/donors/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) })
  },

  async deleteMyDonorAccount(password: string): Promise<void> {
    await request<null>('/donors/me', { method: 'DELETE', body: JSON.stringify({ password }) })
    setToken(null)
  },

  // ── Fundaciones y causas ───────────────────────────────────────────
  async getFoundation(foundationId: string): Promise<Foundation | null> {
    const res = await orNull(request<{ foundation: Foundation }>(`/foundations/${encodeURIComponent(foundationId)}`))
    return res?.foundation ?? null
  },

  async listActiveCauses(): Promise<Cause[]> {
    return (await request<{ causes: Cause[] }>('/causes')).causes
  },

  /** El backend identifica la fundación por la sesión; el id se ignora. */
  async listCausesByFoundation(_foundationId: string): Promise<Cause[]> {
    return (await request<{ causes: Cause[] }>('/foundations/me/causes')).causes
  },

  async getCause(causeId: string): Promise<Cause | null> {
    const res = await orNull(request<{ cause: Cause }>(`/causes/${encodeURIComponent(causeId)}`))
    return res?.cause ?? null
  },

  async createCause(_foundationId: string, input: CauseInput): Promise<Cause> {
    return (await request<{ cause: Cause }>('/foundations/me/causes', { method: 'POST', body: JSON.stringify(input) })).cause
  },

  async setCauseStatus(causeId: string, status: CauseStatus): Promise<Cause> {
    return (
      await request<{ cause: Cause }>(`/foundations/me/causes/${encodeURIComponent(causeId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    ).cause
  },

  // ── Donaciones: las conecta otra parte del equipo ──────────────────
  quoteDonation: (): Promise<Quote> => notYet(),
  donate: (): Promise<Donation> => notYet(),
  // El backend de donaciones guarda su propio registro; aquí no hay nada que hacer.
  recordDonation: async (): Promise<void> => {},
  donationsByDonor: async (): Promise<Donation[]> => [],
  donationsByFoundation: async (): Promise<Donation[]> => [],
}
