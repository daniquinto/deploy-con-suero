/**
 * Implementación de DEMO del API: guarda todo en localStorage de este navegador.
 * Replica los campos y las reglas de negocio del backend para poder navegar
 * el flujo completo sin servidor. No mueve dinero real.
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
import { toWalletUrl } from '../lib/format'
import { CATALOG_CAUSES, CATALOG_FOUNDATIONS } from '../data/catalog'

type StoredDonor = Omit<DonorProfile, 'id' | 'name' | 'email' | 'walletAddress' | 'createdAt'>

interface StoredUser extends User {
  passwordHash: string
  createdAt: string
  donor?: StoredDonor
}

/** v4: catálogo de causas de docs/causas.md. */
const KEYS = {
  users: 'ma.v4.users',
  foundations: 'ma.v4.foundations',
  causes: 'ma.v4.causes',
  donations: 'ma.v4.donations',
  session: 'ma.v4.session',
} as const

/** Tasas de ejemplo hacia COP. En producción la conversión la da la quote de Open Payments. */
const RATES_TO_COP: Record<string, number> = { COP: 1, USD: 4280, EUR: 4648, MXN: 236 }

const SEED_FOUNDATIONS: Foundation[] = CATALOG_FOUNDATIONS
const SEED_CAUSES: Cause[] = CATALOG_CAUSES

/** SHA-256 de "password": las dos cuentas de prueba usan esa contraseña. */
const PASSWORD_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'

/** Cuentas quemadas para la demo del hackathon. */
export const DEMO_ACCOUNTS = [
  { role: 'donor' as const, email: 'donador@gmail.com', password: 'password' },
  { role: 'foundation' as const, email: 'fundacion@gmail.com', password: 'password' },
]

const SEED_USERS: StoredUser[] = [
  {
    id: 'demo-donor',
    role: 'donor',
    name: 'Daniela Restrepo',
    email: 'donador@gmail.com',
    walletAddress: 'https://ilp.interledger-test.dev/106c3c01',
    foundationId: null,
    foundationStatus: null,
    passwordHash: PASSWORD_HASH,
    createdAt: '2026-10-10T15:00:00.000Z',
    donor: {
      firstNames: 'Daniela',
      lastNames: 'Restrepo',
      documentType: 'CC',
      documentNumber: '1037654321',
      gender: 'F',
      publicName: null,
      country: 'ES',
      preferredCurrency: 'EUR',
      isAnonymous: false,
    },
  },
  {
    id: 'demo-foundation',
    role: 'foundation',
    name: 'Fundación Agua y Vida',
    email: 'fundacion@gmail.com',
    walletAddress: null,
    foundationId: 'agua-y-vida',
    foundationStatus: 'ACTIVA',
    passwordHash: PASSWORD_HASH,
    createdAt: '2026-10-05T15:00:00.000Z',
  },
]

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Lee una colección sembrando los datos de ejemplo la primera vez. */
function seeded<T>(key: string, seed: T[]): T[] {
  const stored = read<T[] | null>(key, null)
  if (stored) return stored
  write(key, seed)
  return seed
}

const foundations = () => seeded(KEYS.foundations, SEED_FOUNDATIONS)
const causes = () => seeded(KEYS.causes, SEED_CAUSES)
const donations = () => read<Donation[]>(KEYS.donations, [])
const users = () => seeded(KEYS.users, SEED_USERS)

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))
const newId = () => crypto.randomUUID()

async function hash(password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

function publicUser(user: StoredUser): User {
  const foundation = foundations().find((f) => f.id === user.foundationId)
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    walletAddress: user.walletAddress,
    foundationId: user.foundationId,
    foundationStatus: foundation?.status ?? null,
  }
}

function donorProfile(user: StoredUser): DonorProfile {
  return { id: user.id, name: user.name, email: user.email, walletAddress: user.walletAddress, createdAt: user.createdAt, ...user.donor! }
}

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'item'}-${newId().slice(0, 4)}`
}

function sessionUser(): StoredUser | null {
  const sessionId = read<string | null>(KEYS.session, null)
  return users().find((u) => u.id === sessionId) ?? null
}

function requireDonor(): StoredUser {
  const user = sessionUser()
  if (!user || user.role !== 'donor' || !user.donor) throw new Error('Necesitas iniciar sesión como donante.')
  return user
}

function saveUser(updated: StoredUser): void {
  write(KEYS.users, users().map((u) => (u.id === updated.id ? updated : u)))
}

/** Simula la autorización del backend: solo la fundación dueña puede tocar sus causas. */
function requireOwner(foundationId: string): Foundation {
  const user = sessionUser()
  if (!user || user.role !== 'foundation' || user.foundationId !== foundationId) {
    throw new Error('No tienes permiso para modificar esta causa.')
  }
  return foundations().find((f) => f.id === foundationId)!
}

/** Regla de negocio: solo una fundación ACTIVA puede crear o publicar causas. */
function requireActive(foundation: Foundation): void {
  if (foundation.status !== 'ACTIVA') {
    throw new Error('Tu fundación está pendiente de activación. Podrás publicar causas cuando una entidad la active.')
  }
}

function validateCause(input: CauseInput): void {
  if (input.title.trim().length < 5) throw new Error('El título debe tener al menos 5 caracteres.')
  if (input.description.trim().length < 20) throw new Error('Cuenta en al menos 20 caracteres a qué se destinará el dinero.')
  if (!input.location.trim()) throw new Error('Indica dónde se usará la ayuda.')
  if (!Number.isInteger(input.goal) || input.goal <= 0) throw new Error('La meta debe ser un número entero mayor que cero.')
}

export const mockApi = {
  // ── Sesión ─────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<User> {
    await delay()
    const all = users()
    const email = input.email.trim().toLowerCase()
    if (all.some((u) => u.email === email)) throw new Error('Ya existe una cuenta con ese correo.')

    const base = { id: newId(), email, walletAddress: null, passwordHash: await hash(input.password), createdAt: new Date().toISOString() }
    let user: StoredUser

    if (input.role === 'donor') {
      if (all.some((u) => u.donor?.documentType === input.documentType && u.donor.documentNumber === input.documentNumber.trim())) {
        throw new Error('Ya existe una cuenta con ese documento.')
      }
      user = {
        ...base,
        role: 'donor',
        name: `${input.firstNames.trim()} ${input.lastNames.trim()}`,
        foundationId: null,
        foundationStatus: null,
        donor: {
          firstNames: input.firstNames.trim(),
          lastNames: input.lastNames.trim(),
          documentType: input.documentType,
          documentNumber: input.documentNumber.trim(),
          gender: input.gender,
          publicName: null,
          country: 'CO',
          preferredCurrency: null,
          isAnonymous: false,
        },
      }
    } else {
      const list = foundations()
      if (list.some((f) => f.idType === input.idType && f.idNumber === input.idNumber.trim())) {
        throw new Error('Ya existe una fundación con esa identificación.')
      }
      const foundation: Foundation = {
        id: slug(input.name),
        name: input.name.trim(),
        legalRepresentative: input.legalRepresentative.trim(),
        idType: input.idType,
        idNumber: input.idNumber.trim(),
        location: '',
        description: '',
        walletAddress: '',
        currency: 'COP',
        // Igual que el backend con AUTO_ACTIVATE_FOUNDATIONS=true.
        status: 'ACTIVA',
      }
      write(KEYS.foundations, [...list, foundation])
      user = { ...base, role: 'foundation', name: foundation.name, foundationId: foundation.id, foundationStatus: 'ACTIVA' }
    }

    write(KEYS.users, [...all, user])
    write(KEYS.session, user.id)
    return publicUser(user)
  },

  /** `role`: el tipo de cuenta que la persona eligió al ingresar; debe coincidir con el de la cuenta. */
  async login(email: string, password: string, role?: Role): Promise<User> {
    await delay()
    const user = users().find((u) => u.email === email.trim().toLowerCase())
    if (!user || user.passwordHash !== (await hash(password))) throw new Error('Correo o contraseña incorrectos.')
    if (role && user.role !== role) {
      throw new Error(
        user.role === 'foundation'
          ? 'Esta cuenta es de una fundación. Elige «Soy fundación» para ingresar.'
          : 'Esta cuenta es de un donante. Elige «Soy donante» para ingresar.',
      )
    }
    write(KEYS.session, user.id)
    return publicUser(user)
  },

  async logout(): Promise<void> {
    localStorage.removeItem(KEYS.session)
  },

  async currentUser(): Promise<User | null> {
    const user = sessionUser()
    return user ? publicUser(user) : null
  },

  // ── Perfil del donante ─────────────────────────────────────────────

  async getMyDonorProfile(): Promise<DonorProfile> {
    await delay(200)
    return donorProfile(requireDonor())
  },

  async updateMyDonorProfile(changes: DonorProfileUpdate): Promise<DonorProfile> {
    await delay()
    const user = requireDonor()
    const { walletAddress, ...profile } = changes
    const donor = { ...user.donor!, ...profile }
    const updated: StoredUser = {
      ...user,
      donor,
      name: `${donor.firstNames} ${donor.lastNames}`,
      walletAddress: walletAddress === undefined ? user.walletAddress : walletAddress ? toWalletUrl(walletAddress) : null,
    }
    saveUser(updated)
    return donorProfile(updated)
  },

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await delay()
    const user = requireDonor()
    if (user.passwordHash !== (await hash(currentPassword))) throw new Error('La contraseña no es correcta.')
    if (newPassword.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres.')
    saveUser({ ...user, passwordHash: await hash(newPassword) })
  },

  async deleteMyDonorAccount(password: string): Promise<void> {
    await delay()
    const user = requireDonor()
    if (user.passwordHash !== (await hash(password))) throw new Error('La contraseña no es correcta.')
    write(KEYS.users, users().filter((u) => u.id !== user.id))
    localStorage.removeItem(KEYS.session)
  },

  // ── Fundaciones y causas ───────────────────────────────────────────

  async getFoundation(foundationId: string): Promise<Foundation | null> {
    await delay(150)
    return foundations().find((f) => f.id === foundationId) ?? null
  },

  /** Causas activas de fundaciones ACTIVAS, las más recientes primero. */
  async listActiveCauses(): Promise<Cause[]> {
    await delay(200)
    const active = new Set(foundations().filter((f) => f.status === 'ACTIVA').map((f) => f.id))
    return causes()
      .filter((c) => c.status === 'active' && active.has(c.foundationId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  /** Todas las causas de una fundación (activas y cerradas). Para su panel. */
  async listCausesByFoundation(foundationId: string): Promise<Cause[]> {
    await delay(200)
    return causes()
      .filter((c) => c.foundationId === foundationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async getCause(causeId: string): Promise<Cause | null> {
    await delay(150)
    return causes().find((c) => c.id === causeId) ?? null
  },

  async createCause(foundationId: string, input: CauseInput): Promise<Cause> {
    await delay()
    const foundation = requireOwner(foundationId)
    requireActive(foundation)
    validateCause(input)

    const cause: Cause = {
      id: slug(input.title),
      foundationId,
      foundationName: foundation.name,
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim(),
      goal: input.goal,
      raised: 0,
      currency: foundation.currency,
      donationsCount: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    write(KEYS.causes, [cause, ...causes()])
    return cause
  },

  async setCauseStatus(causeId: string, status: CauseStatus): Promise<Cause> {
    await delay(250)
    const list = causes()
    const cause = list.find((c) => c.id === causeId)
    if (!cause) throw new Error('La causa no existe.')
    const foundation = requireOwner(cause.foundationId)
    if (status === 'active') requireActive(foundation)
    const updated = { ...cause, status }
    write(KEYS.causes, list.map((c) => (c.id === causeId ? updated : c)))
    return updated
  },

  // ── Donaciones ─────────────────────────────────────────────────────

  /** Equivale a crear incoming payment + quote en el backend. */
  async quoteDonation(causeId: string, amount: number, currency: string): Promise<Quote> {
    await delay(500)
    const cause = causes().find((c) => c.id === causeId)
    if (!cause) throw new Error('La causa no existe.')
    if (cause.status !== 'active') throw new Error('Esta causa ya no recibe donaciones.')
    const rate = (RATES_TO_COP[currency] ?? 1) / (RATES_TO_COP[cause.currency] ?? 1)
    return {
      sent: { amount, currency },
      received: { amount: Math.round(amount * rate), currency: cause.currency },
      rate,
    }
  },

  /**
   * En producción: el backend crea el grant interactivo y devuelve redirectUrl
   * para que el donante apruebe en SU wallet. En demo se completa al instante.
   */
  async donate(donorId: string, causeId: string, quote: Quote): Promise<Donation> {
    await delay(800)
    const list = causes()
    const cause = list.find((c) => c.id === causeId)
    if (!cause) throw new Error('La causa no existe.')
    if (cause.status !== 'active') throw new Error('Esta causa ya no recibe donaciones.')

    const donation: Donation = {
      id: newId(),
      donorId,
      causeId,
      causeTitle: cause.title,
      foundationId: cause.foundationId,
      foundationName: cause.foundationName,
      sent: quote.sent,
      received: quote.received,
      status: 'completed',
      createdAt: new Date().toISOString(),
    }
    write(KEYS.donations, [donation, ...donations()])
    write(
      KEYS.causes,
      list.map((c) =>
        c.id === causeId
          ? { ...c, raised: c.raised + quote.received.amount, donationsCount: c.donationsCount + 1 }
          : c,
      ),
    )
    return donation
  },

  /**
   * Registra una donación hecha con Open Payments real (para "Mis donaciones").
   * Idempotente por id: si ya existe, no la duplica ni suma dos veces a la causa.
   */
  async recordDonation(donation: Donation): Promise<void> {
    const list = donations()
    if (list.some((d) => d.id === donation.id)) return
    const cause = causes().find((c) => c.id === donation.causeId)
    write(KEYS.donations, [{ ...donation, foundationId: cause?.foundationId ?? donation.foundationId }, ...list])
    if (cause && donation.received.currency === cause.currency) {
      write(
        KEYS.causes,
        causes().map((c) =>
          c.id === cause.id ? { ...c, raised: c.raised + Math.round(donation.received.amount), donationsCount: c.donationsCount + 1 } : c,
        ),
      )
    }
  },

  async donationsByDonor(donorId: string): Promise<Donation[]> {
    await delay(200)
    return donations().filter((d) => d.donorId === donorId)
  },

  async donationsByFoundation(foundationId: string): Promise<Donation[]> {
    await delay(200)
    return donations().filter((d) => d.foundationId === foundationId)
  },
}

/** Equivalencia aproximada a USD para validar el monto mínimo de donación. */
export const RATES_TO_USD: Record<string, number> = Object.fromEntries(
  Object.entries(RATES_TO_COP).map(([code, cop]) => [code, cop / RATES_TO_COP.USD]),
)
