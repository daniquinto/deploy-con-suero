import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Copy, HandHeart, Loader2, Send, ShieldCheck, XCircle } from 'lucide-react'
import { Alert, Loading } from '../components/ui'
import { api } from '../services/api'
import {
  donationsApi,
  FINAL_STATUSES,
  loadDonationContext,
  toDisplayMoney,
  type DonationStatus,
  type OpDonation,
} from '../services/donationsApi'

const VIEW: Record<DonationStatus, { title: string; text: string; tone: 'wait' | 'ok' | 'bad' }> = {
  awaiting_consent: { title: 'Esperando tu autorización', text: 'Aún no confirmas el pago en tu wallet.', tone: 'wait' },
  authorized: { title: 'Pago autorizado', text: 'Estamos creando el pago. No cierres esta página.', tone: 'wait' },
  sending: { title: 'Tu donación va en camino', text: 'El dinero viaja por Interledger. Suele tardar unos segundos.', tone: 'wait' },
  completed: { title: '¡Tu donación llegó!', text: 'El fondo de Mano Abierta recibió tu aporte y lo entregará a la fundación.', tone: 'ok' },
  failed: { title: 'El pago no se pudo completar', text: 'Tu proveedor rechazó o no completó el pago. No se te cobró dos veces.', tone: 'bad' },
  expired: { title: 'La donación caducó', text: 'Pasó el tiempo para autorizarla. Puedes empezar de nuevo.', tone: 'bad' },
  cancelled: { title: 'Donación cancelada', text: 'No se movió dinero. Puedes intentarlo cuando quieras.', tone: 'bad' },
}

/**
 * Ruta de retorno del callback: FRONTEND_URL/donacion/:id?status=…
 * El `status` de la URL es solo una señal; la verdad es GET /api/donations/:id.
 */
export function DonationStatusPage() {
  const { id = '' } = useParams()
  const context = loadDonationContext(id)
  const [donation, setDonation] = useState<OpDonation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const recorded = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let delay = 2500

    const poll = async () => {
      try {
        const next = await donationsApi.getDonation(id)
        if (cancelled) return
        setDonation(next)
        setError(null)
        if (FINAL_STATUSES.includes(next.status)) return
      } catch (e) {
        if (cancelled) return
        // No saber todavía no es haber fallado: seguimos consultando.
        setError(e instanceof Error ? e.message : 'No pudimos consultar el estado.')
      }
      delay = Math.min(delay + 500, 5000)
      timer = setTimeout(poll, delay)
    }

    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id])

  // Al completarse, queda en "Mis donaciones" del donante (una sola vez).
  useEffect(() => {
    if (donation?.status !== 'completed' || recorded.current || !context?.donorId) return
    recorded.current = true
    void api.recordDonation({
      id: donation.donationId,
      donorId: context.donorId,
      causeId: context.causeId,
      causeTitle: context.causeTitle,
      foundationId: '',
      foundationName: context.foundationName,
      sent: toDisplayMoney(donation.amounts.debit),
      received: toDisplayMoney(donation.amounts.received ?? donation.amounts.receive),
      status: 'completed',
      createdAt: donation.createdAt,
    })
  }, [donation, context])

  if (!donation && !error) return <Loading label="Consultando tu donación…" />

  const view = donation ? VIEW[donation.status] : null
  const Icon = !view ? Clock : view.tone === 'ok' ? CheckCircle2 : view.tone === 'bad' ? XCircle : donation?.status === 'sending' ? Send : Loader2

  const copyRef = async () => {
    await navigator.clipboard?.writeText(id).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="narrow stack-md" style={{ margin: '0 auto' }}>
      <section className="card card-lg stack-md center" aria-live="polite">
        <span className={`success-mark status-${view?.tone ?? 'wait'}`}>
          <Icon aria-hidden className={view?.tone === 'wait' && donation?.status !== 'sending' ? 'spin' : undefined} />
        </span>
        <div className="stack-sm">
          <h1>{view?.title ?? 'Consultando tu donación…'}</h1>
          <p className="muted">{view?.text}</p>
          {context && <p className="small">Para <strong>{context.causeTitle}</strong> · {context.foundationName}</p>}
        </div>

        {donation && (
          <div className="quote-box" style={{ textAlign: 'left' }}>
            <div className="quote-row"><span className="muted">Pagaste</span><span className="strong num">{donation.amounts.debit?.formatted ?? '—'}</span></div>
            <div className="quote-row">
              <span className="muted">{donation.status === 'completed' ? 'Recibió el fondo' : 'Llegará al fondo'}</span>
              <span className="strong num" style={{ color: 'var(--primary)' }}>
                {(donation.status === 'completed' ? donation.amounts.received : donation.amounts.receive)?.formatted ?? '—'}
              </span>
            </div>
            <hr className="divider" style={{ margin: '14px 0' }} />
            <div className="quote-row small">
              <span className="muted">Referencia</span>
              <button type="button" className="btn btn-quiet btn-sm mono" onClick={copyRef} title="Copiar referencia">
                {id.slice(0, 8)}… <Copy size={14} aria-hidden />{copied && <span className="xsmall">Copiado</span>}
              </button>
            </div>
          </div>
        )}

        {donation?.failureReason && <Alert tone="warning">{donation.failureReason}</Alert>}
        {error && <Alert tone="info">{error} Seguimos intentando…</Alert>}

        <div className="row center-row">
          {donation?.status === 'awaiting_consent' && donation.interact?.redirectUrl && (
            <a className="btn btn-primary btn-lg" href={donation.interact.redirectUrl}>Autorizar en mi wallet</a>
          )}
          {donation && ['failed', 'expired', 'cancelled'].includes(donation.status) && context && (
            <Link to={`/causas/${context.causeId}/donar`} className="btn btn-primary btn-lg">Intentar de nuevo</Link>
          )}
          {donation?.status === 'completed' && <Link to="/mis-donaciones" className="btn btn-primary btn-lg">Ver mis donaciones</Link>}
          <Link to="/causas" className="btn btn-ghost btn-lg"><HandHeart aria-hidden />Ver causas</Link>
        </div>
      </section>

      <p className="xsmall muted row center-row" style={{ gap: 8 }}>
        <ShieldCheck size={16} aria-hidden style={{ color: 'var(--primary)' }} />
        Pago procesado con Open Payments. Nunca reintentes una donación que dice «va en camino»: se cobraría dos veces.
      </p>
    </div>
  )
}
