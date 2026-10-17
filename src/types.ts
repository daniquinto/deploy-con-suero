export type Role = 'donor' | 'foundation'

/** Regla de negocio: la fundación nace PENDIENTE; solo ACTIVA publica causas y recibe donaciones. */
export type FoundationStatus = 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA'

export interface User {
  id: string
  role: Role
  name: string
  email: string
  /** Wallet address de Open Payments (se agrega desde el perfil). */
  walletAddress: string | null
  /** Solo fundaciones */
  foundationId: string | null
  foundationStatus: FoundationStatus | null
}

export interface Foundation {
  id: string
  name: string
  location: string
  description: string
  /** Donde recibe las donaciones. Vacío si aún no la registra. */
  walletAddress: string
  /** Moneda en la que recibe (la de su wallet). */
  currency: string
  status: FoundationStatus
  /** Solo en el perfil propio (no en la vista pública). */
  legalRepresentative?: string
  idType?: FoundationIdType
  idNumber?: string
}

export type CauseStatus = 'active' | 'closed'

/** Una campaña concreta de una fundación: a esto es a lo que dona la gente. */
export interface Cause {
  id: string
  foundationId: string
  foundationName: string
  title: string
  description: string
  location: string
  /** Meta y recaudo en la moneda de la fundación. */
  goal: number
  raised: number
  currency: string
  donationsCount: number
  status: CauseStatus
  createdAt: string
  /** Datos de catálogo (docs/causas.md en main). Opcionales en causas creadas desde la app. */
  imageUrl?: string
  category?: string
  beneficiaries?: number
  /** Fecha límite, ISO (AAAA-MM-DD). */
  deadline?: string
  fundsUse?: string[]
}

export interface CauseInput {
  title: string
  description: string
  location: string
  goal: number
}

export type DonationStatus = 'pending' | 'completed' | 'failed'

export interface Donation {
  id: string
  donorId: string
  causeId: string
  causeTitle: string
  foundationId: string
  foundationName: string
  /** Lo que paga el donante, en su moneda. */
  sent: Money
  /** Lo que recibe la fundación, en su moneda. */
  received: Money
  status: DonationStatus
  createdAt: string
}

export interface Money {
  amount: number
  currency: string
}

export interface Quote {
  sent: Money
  received: Money
  rate: number
}

// ── Registro ─────────────────────────────────────────────────────────

export type DocumentType = 'CC' | 'CE' | 'TI' | 'PA' | 'PPT' | 'DNI'
export type Gender = 'F' | 'M' | 'NB' | 'ND'
export type FoundationIdType = 'NIT' | 'RUT' | 'REGISTRO_EXTRANJERO' | 'OTRO'

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
  { value: 'DNI', label: 'Documento extranjero (DNI)' },
]

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
  { value: 'NB', label: 'No binario' },
  { value: 'ND', label: 'Prefiero no decirlo' },
]

export const FOUNDATION_ID_TYPES: { value: FoundationIdType; label: string }[] = [
  { value: 'NIT', label: 'NIT' },
  { value: 'RUT', label: 'RUT' },
  { value: 'REGISTRO_EXTRANJERO', label: 'Registro extranjero' },
  { value: 'OTRO', label: 'Otro' },
]

export interface DonorRegisterInput {
  role: 'donor'
  firstNames: string
  lastNames: string
  documentType: DocumentType
  documentNumber: string
  gender: Gender
  email: string
  password: string
}

export interface FoundationRegisterInput {
  role: 'foundation'
  name: string
  legalRepresentative: string
  idType: FoundationIdType
  idNumber: string
  email: string
  password: string
}

export type RegisterInput = DonorRegisterInput | FoundationRegisterInput

// ── Perfil del donante (CRUD en /api/donors/me) ──────────────────────

export interface DonorProfile {
  id: string
  name: string
  email: string
  walletAddress: string | null
  firstNames: string
  lastNames: string
  documentType: DocumentType
  documentNumber: string
  gender: Gender
  /** Cómo aparece en las donaciones; null = su nombre. */
  publicName: string | null
  country: string
  preferredCurrency: string | null
  isAnonymous: boolean
  createdAt: string
}

export type DonorProfileUpdate = Partial<{
  firstNames: string
  lastNames: string
  gender: Gender
  publicName: string | null
  country: string
  walletAddress: string
  preferredCurrency: string | null
  isAnonymous: boolean
}>
