/**
 * Cliente de la API de donaciones con Open Payments (rama `backend`, src/donations).
 * Contratos: guía "Endpoints de donaciones en https://deploy.szapatar.dev".
 *
 * Base: VITE_DONATIONS_API_URL. Vacía = mismo origen (/api), que es lo que pasa
 * en producción y en desarrollo gracias al proxy de Vite (vite.config.ts).
 *
 * Reglas de dinero: `value` es un entero en texto; para mostrar se usa `formatted`.
 * Nunca se convierten montos a Number para hacer cuentas.
 */

const BASE = `${(import.meta.env.VITE_DONATIONS_API_URL ?? '').replace(/\/+$/, '')}/api`

export interface OpAmount {
  value: string
  assetCode: string
  assetScale: number
  formatted: string
}

export interface Fund {
  walletAddress: string
  publicName: string | null
  assetCode: string
  assetScale: number
  limits: { minAmount: string | null; maxAmount: string | null }
  amountModes: ('send' | 'receive')[]
  consentMode: 'finish' | 'poll'
  suggestedAmounts: string[]
  expiryMinutes: number
}

export interface WalletInfo {
  walletAddress: string
  publicName: string | null
  assetCode: string
  assetScale: number
}

export interface WalletConnection {
  ok: true
  donor: WalletInfo
  fund: WalletInfo
  sameAsset: boolean
  conversionNotice: string | null
}

export type DonationStatus = 'awaiting_consent' | 'authorized' | 'sending' | 'completed' | 'failed' | 'expired' | 'cancelled'

export const FINAL_STATUSES: DonationStatus[] = ['completed', 'failed', 'expired', 'cancelled']

export interface OpDonation {
  donationId: string
  externalRef: string
  status: DonationStatus
  createdAt: string
  updatedAt: string
  donor: { walletAddress: string; assetCode?: string; assetScale?: number }
  fund: { walletAddress: string; publicName: string | null; assetCode?: string; assetScale?: number }
  amounts: {
    mode: 'send' | 'receive'
    debit: OpAmount | null
    receive: OpAmount | null
    sent: OpAmount | null
    received: OpAmount | null
    sameAsset: boolean
  }
  description: string | null
  donorName: string | null
  resources: {
    incomingPaymentId: string | null
    quoteId: string | null
    quoteExpiresAt?: string | null
    outgoingPaymentId: string | null
  }
  failureReason: string | null
  nextStep?: string
  interact?: { mode: 'finish' | 'poll'; redirectUrl: string; expiresAt: string } | null
}

export class DonationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly hint: string | null = null,
  ) {
    super(message)
    this.name = 'DonationApiError'
  }
}

/** Mensajes en lenguaje de usuario para los códigos que más se ven. */
const FRIENDLY: Record<string, string> = {
  OP_NOT_FOUND: 'No encontramos esa wallet address. Revisa que esté bien escrita.',
  DONATION_INVALID_WALLET: 'La wallet address no es válida.',
  DONATION_DONOR_UNRESOLVED: 'No pudimos verificar tu wallet. Revisa que esté bien escrita.',
  DONATION_SAME_WALLET: 'No puedes donar desde la misma wallet que recibe.',
  DONATION_INVALID_AMOUNT: 'El monto no es válido para tu moneda.',
  DONATION_AMOUNT_OUT_OF_RANGE: 'El monto está fuera de los límites permitidos.',
  DONATION_NOT_CANCELLABLE: 'Esta donación ya se está enviando y no se puede cancelar.',
  OP_UNPROCESSABLE: 'Tu proveedor rechazó el pago. Revisa el saldo de tu wallet.',
  OP_UNREACHABLE: 'El proveedor de pagos no responde. Intenta de nuevo en un momento.',
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new DonationApiError('No hay conexión con el servicio de pagos.', 0, 'NETWORK')
  }

  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Un 200 en texto plano = el contenedor aún no corre la API (placeholder de despliegue).
    throw new DonationApiError('El servicio de pagos aún no está disponible.', res.status, 'NOT_DEPLOYED')
  }

  if (!res.ok) {
    const b = body as { error?: { code?: string; message?: string; hint?: string }; code?: string; message?: string; hint?: string } | null
    const code = b?.error?.code ?? b?.code ?? null
    const message = (code && FRIENDLY[code]) ?? b?.error?.message ?? b?.message ?? (res.status >= 500 ? 'El servicio de pagos no está disponible en este momento.' : `Error ${res.status}.`)
    throw new DonationApiError(message, res.status, code, b?.error?.hint ?? b?.hint ?? null)
  }
  return { status: res.status, body: body as T }
}

export const donationsApi = {
  /** 1 · A dónde va el dinero, moneda del fondo, límites y montos sugeridos. */
  async getFund(): Promise<Fund> {
    return (await request<Fund>('/fund')).body
  },

  /** 2 · Valida la wallet del donante (lectura pública, no mueve dinero). */
  async connectWallet(walletAddress: string): Promise<WalletConnection> {
    return (await request<WalletConnection>('/wallet/connect', { method: 'POST', body: JSON.stringify({ walletAddress }) })).body
  },

  /**
   * 3 · Crea la donación: incoming payment + quote + grant interactivo.
   * `idempotencyKey` evita cobrar dos veces ante un doble clic o un reintento.
   */
  async createDonation(input: {
    donorWalletAddress: string
    amount: string
    description: string
    donorName?: string
    idempotencyKey: string
  }): Promise<OpDonation> {
    const { idempotencyKey, ...body } = input
    return (
      await request<OpDonation>('/donations', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ ...body, amountMode: 'send' }),
      })
    ).body
  },

  /** 5 · Estado (fuente de verdad). Al consultarlo el backend avanza el flujo. */
  async getDonation(donationId: string): Promise<OpDonation> {
    return (await request<OpDonation>(`/donations/${encodeURIComponent(donationId)}`)).body
  },

  /** 7 · Cancela una donación que todavía no movió dinero. */
  async cancelDonation(donationId: string, reason: string): Promise<OpDonation> {
    return (await request<OpDonation>(`/donations/${encodeURIComponent(donationId)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })).body
  },
}

// ── Contexto local de la donación en curso ──────────────────────────────
// La API no conoce las causas: guardamos a qué causa iba cada donación para
// mostrarlo al volver del proveedor y en "Mis donaciones".

export interface PendingDonationContext {
  donationId: string
  causeId: string
  causeTitle: string
  foundationName: string
  donorId: string | null
}

const CONTEXT_KEY = 'ma.donations.context'

export function saveDonationContext(ctx: PendingDonationContext): void {
  try {
    const all = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? '{}') as Record<string, PendingDonationContext>
    all[ctx.donationId] = ctx
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(all))
  } catch {
    /* sin almacenamiento: la pantalla de estado funciona igual, solo sin el nombre de la causa */
  }
}

export function loadDonationContext(donationId: string): PendingDonationContext | null {
  try {
    const all = JSON.parse(localStorage.getItem(CONTEXT_KEY) ?? '{}') as Record<string, PendingDonationContext>
    return all[donationId] ?? null
  } catch {
    return null
  }
}

/** "10.50 USD" → { amount: 10.5, currency: 'USD' } (solo para mostrar en listas). */
export function toDisplayMoney(a: OpAmount | null | undefined): { amount: number; currency: string } {
  if (!a) return { amount: 0, currency: '' }
  const digits = a.value.padStart(a.assetScale + 1, '0')
  const text = a.assetScale > 0 ? `${digits.slice(0, -a.assetScale)}.${digits.slice(-a.assetScale)}` : digits
  return { amount: Number(text), currency: a.assetCode }
}
