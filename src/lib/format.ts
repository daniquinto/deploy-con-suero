import type { Money } from '../types'

export function formatMoney({ amount, currency }: Money): string {
  const decimals = currency === 'COP' ? 0 : 2
  return `${amount.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

/** "$ilp.interledger-test.dev/ana" → "https://ilp.interledger-test.dev/ana" */
export function toWalletUrl(input: string): string {
  const value = input.trim()
  if (value.startsWith('$')) return `https://${value.slice(1)}`
  if (!/^https?:\/\//i.test(value)) return `https://${value}`
  return value.replace(/\/+$/, '')
}

export function isValidWallet(input: string): boolean {
  try {
    const url = new URL(toWalletUrl(input))
    return url.hostname.includes('.') && url.pathname.length > 1
  } catch {
    return false
  }
}
