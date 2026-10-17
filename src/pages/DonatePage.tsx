import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Check, CheckCircle2, ExternalLink, HandHeart, Loader2, MapPin, ShieldCheck, Timer, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { CauseCover } from '../components/CauseCard'
import { Progress } from '../components/Progress'
import { Alert, EmptyState, Loading, TextField } from '../components/ui'
import { formatMoney, isValidWallet, toWalletUrl } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { api, SUPPORTED_CURRENCIES } from '../services/api'
import {
  DonationApiError,
  donationsApi,
  saveDonationContext,
  type Fund,
  type OpDonation,
  type WalletConnection,
} from '../services/donationsApi'
import { RATES_TO_USD } from '../services/mockApi'
import type { Cause, Donation, Quote } from '../types'

/** Regla de negocio: mínimo 1 USD para que las comisiones no se coman la donación. */
const MIN_USD = 1

const STEPS = ['Monto', 'Revisar', 'Autorizar'] as const

export function DonatePage() {
  const { id = '' } = useParams()
  const { data: cause, loading, error } = useAsync(() => api.getCause(id), [id])
  const fund = useAsync(() => donationsApi.getFund(), [])
  const [demo, setDemo] = useState(false)

  if (loading) return <Loading />
  if (error) return <Alert tone="error">{error}</Alert>
  if (!cause) {
    return <EmptyState icon={HandHeart} title="Causa no encontrada" action={<Link to="/causas" className="btn btn-primary">Ver causas</Link>} />
  }
  if (cause.status !== 'active') {
    return (
      <EmptyState icon={HandHeart} title="Esta causa está cerrada" action={<Link to="/causas" className="btn btn-primary">Ver otras causas</Link>}>
        Ya no recibe donaciones. Hay otras causas que necesitan ayuda hoy.
      </EmptyState>
    )
  }

  return (
    <div className="stack-md">
      <Link to={`/causas/${cause.id}`} className="back-link"><ArrowLeft size={16} aria-hidden />Volver a la causa</Link>

      <div className="split">
        <section className="card card-lg stack-md">
          {fund.loading ? (
            <Loading label="Conectando con el servicio de pagos…" />
          ) : demo ? (
            <DemoDonation cause={cause} />
          ) : fund.data ? (
            <LiveDonation cause={cause} fund={fund.data} />
          ) : (
            <div className="stack">
              <h1>Haz tu donación</h1>
              <Alert tone="warning">
                <strong>El servicio de pagos con Open Payments no está disponible ahora.</strong>
                <br />
                {fund.error}
              </Alert>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>Reintentar</button>
                <button type="button" className="btn btn-primary" onClick={() => setDemo(true)}>Continuar en modo demo</button>
              </div>
            </div>
          )}
        </section>

        <aside className="card cause-card sticky" aria-label="Causa">
          <CauseCover cause={cause} />
          <div className="cause-body">
            <h3>{cause.title}</h3>
            <span className="cause-meta"><MapPin aria-hidden />{cause.location}</span>
            <Progress raised={cause.raised} goal={cause.goal} currency={cause.currency} showGoal />
            <p className="xsmall muted row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <ShieldCheck size={16} aria-hidden style={{ flex: 'none', color: 'var(--primary)' }} />
              Tu aporte llega a la wallet de Mano Abierta y se entrega a la fundación de forma controlada.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="stepper" aria-label="Pasos">
      {STEPS.map((label, i) => (
        <li key={label} className={i === current ? 'current' : i < current ? 'done' : ''} aria-current={i === current ? 'step' : undefined}>
          {i > 0 && <span className="bar" aria-hidden />}
          <span className="n">{i < current ? <Check aria-hidden /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  )
}

/** Cuenta regresiva hasta `iso` en formato m:ss. */
function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso])
  if (!iso) return null
  const left = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000))
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }
}

// ── Donación real con Open Payments ─────────────────────────────────────

type WalletCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; data: WalletConnection; url: string }
  | { state: 'error'; message: string }

function LiveDonation({ cause, fund }: { cause: Cause; fund: Fund }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [wallet, setWallet] = useState(user?.walletAddress ?? '')
  const [check, setCheck] = useState<WalletCheck>({ state: 'idle' })
  const [amount, setAmount] = useState(fund.suggestedAmounts[1] ?? '10')
  const [donation, setDonation] = useState<OpDonation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Una clave por intento: si el usuario reintenta el mismo envío, el backend devuelve la misma donación.
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID())
  const countdown = useCountdown(donation?.interact?.expiresAt)

  const donorAsset = check.state === 'ok' ? check.data.donor.assetCode : null

  const verifyWallet = async (value = wallet) => {
    if (!value.trim()) return setCheck({ state: 'idle' })
    if (!isValidWallet(value)) return setCheck({ state: 'error', message: 'Escribe una wallet address válida, por ejemplo $ilp.interledger-test.dev/tu-nombre.' })
    const url = toWalletUrl(value)
    if (check.state === 'ok' && check.url === url) return
    setCheck({ state: 'checking' })
    try {
      setCheck({ state: 'ok', data: await donationsApi.connectWallet(url), url })
    } catch (e) {
      setCheck({ state: 'error', message: e instanceof Error ? e.message : 'No pudimos verificar tu wallet.' })
    }
  }

  useEffect(() => {
    // Wallet guardada en el perfil: se verifica al entrar.
    if (wallet) void verifyWallet(wallet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (check.state !== 'ok') {
      await verifyWallet()
      return setError('Primero verifica tu wallet address: la necesitas para donar.')
    }
    const value = Number(amount.replace(',', '.'))
    if (!/^\d+([.,]\d+)?$/.test(amount.trim()) || value <= 0) return setError('Escribe un monto mayor que cero.')
    const usd = RATES_TO_USD[check.data.donor.assetCode]
    if (usd !== undefined && value * usd < MIN_USD) {
      return setError(`El monto mínimo es 1 USD (o su equivalente en ${check.data.donor.assetCode}), para que las comisiones no se coman tu donación.`)
    }

    setBusy(true)
    try {
      const created = await donationsApi.createDonation({
        donorWalletAddress: check.url,
        amount: amount.trim().replace(',', '.'),
        description: `Donación a «${cause.title}» · ${cause.foundationName}`,
        donorName: user?.name,
        idempotencyKey: `ma-${cause.id}-${attemptKey}`,
      })
      saveDonationContext({
        donationId: created.donationId,
        causeId: cause.id,
        causeTitle: cause.title,
        foundationName: cause.foundationName,
        donorId: user?.id ?? null,
      })
      setDonation(created)
    } catch (err) {
      setError(err instanceof DonationApiError || err instanceof Error ? err.message : 'No se pudo crear la donación.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!donation) return
    setBusy(true)
    try {
      await donationsApi.cancelDonation(donation.donationId, 'El donante cambió el monto o la wallet')
    } catch {
      /* si ya no se puede cancelar, igual volvemos al formulario: la de estado es la verdad */
    }
    setDonation(null)
    setAttemptKey(crypto.randomUUID())
    setBusy(false)
  }

  // ── Paso 2: revisar la cotización y autorizar ──
  if (donation) {
    const expired = countdown?.left === 0
    return (
      <div className="stack-md">
        <div className="stack-sm">
          <h1>Revisa tu donación</h1>
          <Stepper current={1} />
        </div>

        <div className="quote-box">
          <div className="quote-row"><span className="muted">Pagas</span><span className="big-amount" style={{ color: 'var(--text)' }}>{donation.amounts.debit?.formatted}</span></div>
          <div className="quote-row"><span className="muted">Llega al fondo de Mano Abierta</span><span className="strong num" style={{ color: 'var(--primary)' }}>{donation.amounts.receive?.formatted}</span></div>
          <hr className="divider" style={{ margin: '14px 0' }} />
          <div className="quote-row small"><span className="muted">Para</span><span className="strong">{cause.title}</span></div>
          <div className="quote-row small"><span className="muted">Desde</span><span className="mono">{donation.donor.walletAddress.replace('https://', '')}</span></div>
          <div className="quote-row small"><span className="muted">Referencia</span><span className="mono">{donation.donationId.slice(0, 8)}</span></div>
        </div>

        {!donation.amounts.sameAsset && (
          <p className="small muted row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <ArrowRightLeft size={16} aria-hidden style={{ flex: 'none' }} />
            Pagas en {donation.amounts.debit?.assetCode} y el fondo recibe en {donation.amounts.receive?.assetCode}: la conversión la hace Interledger al instante.
          </p>
        )}

        {expired ? (
          <Alert tone="warning">La cotización caducó. Vuelve a cotizar para obtener un monto actualizado.</Alert>
        ) : (
          countdown && <Alert tone="info"><span className="row" style={{ gap: 6 }}><Timer size={16} aria-hidden />Tienes <strong className="num">{countdown.label}</strong> para autorizar el pago en tu wallet.</span></Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        <div className="row">
          <button type="button" className="btn btn-ghost btn-lg" onClick={cancel} disabled={busy}>Cambiar</button>
          {expired ? (
            <button type="button" className="btn btn-primary btn-lg grow" onClick={cancel} disabled={busy}>Cotizar de nuevo</button>
          ) : donation.interact?.redirectUrl ? (
            <a className="btn btn-primary btn-lg grow" href={donation.interact.redirectUrl}>
              Autorizar en mi wallet <ExternalLink aria-hidden />
            </a>
          ) : (
            <button type="button" className="btn btn-primary btn-lg grow" onClick={() => navigate(`/donacion/${donation.donationId}`)}>Ver estado</button>
          )}
        </div>
        <p className="xsmall muted center">Te llevaremos a tu proveedor para aprobar el cargo. Al terminar vuelves aquí y verás el estado del pago.</p>
      </div>
    )
  }

  // ── Paso 1: wallet y monto ──
  return (
    <form onSubmit={submit} className="form" noValidate>
      <div className="stack-sm">
        <h1>Haz tu donación</h1>
        <Stepper current={0} />
      </div>

      <TextField
        label="Tu wallet address"
        icon={Wallet}
        value={wallet}
        onChange={(e) => {
          setWallet(e.target.value)
          if (check.state !== 'idle') setCheck({ state: 'idle' })
        }}
        onBlur={() => void verifyWallet()}
        className="mono"
        placeholder="$ilp.interledger-test.dev/tu-nombre"
        spellCheck={false}
        error={check.state === 'error' ? check.message : null}
        hint="Desde aquí sale tu donación y la apruebas en tu propia wallet. Nunca vemos tus credenciales."
      />
      {check.state === 'checking' && <p className="small muted row" style={{ gap: 8 }}><Loader2 size={16} className="spin" aria-hidden />Verificando tu wallet…</p>}
      {check.state === 'ok' && (
        <Alert tone="success">
          <strong>{check.data.donor.publicName ?? 'Wallet verificada'}</strong> · pagas en <strong>{check.data.donor.assetCode}</strong>
          {check.data.conversionNotice && <><br /><span className="small">{check.data.conversionNotice}</span></>}
        </Alert>
      )}

      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>¿Cuánto quieres donar{donorAsset ? ` en ${donorAsset}` : ''}?</legend>
        <div className="amount-grid">
          {fund.suggestedAmounts.map((v) => (
            <button key={v} type="button" className="amount-opt num" aria-pressed={amount === v} onClick={() => setAmount(v)}>
              {v}
            </button>
          ))}
        </div>
      </fieldset>
      <TextField label="Otro monto" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" hint="Monto mínimo: 1 USD o su equivalente." />

      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || check.state === 'checking'}>
        {busy ? 'Cotizando con Open Payments…' : 'Ver cotización'}
      </button>
    </form>
  )
}

// ── Modo demo (sin servicio de pagos) ──────────────────────────────────

function DemoDonation({ cause }: { cause: Cause }) {
  const { user } = useAuth()
  const [amount, setAmount] = useState('25')
  const [currency, setCurrency] = useState('USD')
  const [wallet, setWallet] = useState(user?.walletAddress ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [done, setDone] = useState<Donation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const step = done ? 2 : quote ? 1 : 0
  const presets = useMemo(() => (currency === 'COP' ? [20000, 50000, 100000, 200000] : currency === 'MXN' ? [100, 200, 500, 1000] : [5, 10, 25, 50]), [currency])

  const requestQuote = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(amount.trim().replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return setError('Escribe un monto mayor que cero.')
    if (value * (RATES_TO_USD[currency] ?? 1) < MIN_USD) return setError(`El monto mínimo es 1 USD (o su equivalente en ${currency}).`)
    if (!isValidWallet(wallet)) return setError('Necesitas una wallet address válida para donar.')
    setBusy(true)
    setError(null)
    try {
      setQuote(await api.quoteDonation(cause.id, value, currency))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cotizar.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!quote || !user) return
    setBusy(true)
    try {
      setDone(await api.donate(user.id, cause.id, quote))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la donación.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-md">
      <div className="stack-sm">
        <h1>Haz tu donación</h1>
        <Stepper current={step} />
      </div>
      <Alert tone="info">Modo demo: no se mueve dinero real.</Alert>

      {done ? (
        <div className="stack center" role="status">
          <span className="success-mark"><CheckCircle2 aria-hidden /></span>
          <h2>¡Gracias, {user?.name.split(' ')[0]}!</h2>
          <p className="lead">{cause.foundationName} recibió <strong>{formatMoney(done.received)}</strong> para «{cause.title}».</p>
          <div className="row center-row">
            <Link to="/mis-donaciones" className="btn btn-primary btn-lg">Ver mis donaciones</Link>
            <Link to="/causas" className="btn btn-ghost btn-lg">Donar a otra causa</Link>
          </div>
        </div>
      ) : quote ? (
        <div className="stack">
          <div className="quote-box">
            <div className="quote-row"><span className="muted">Pagas</span><span className="big-amount" style={{ color: 'var(--text)' }}>{formatMoney(quote.sent)}</span></div>
            <div className="quote-row"><span className="muted">Recibe {cause.foundationName}</span><span className="strong num" style={{ color: 'var(--primary)' }}>≈ {formatMoney(quote.received)}</span></div>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="row">
            <button type="button" className="btn btn-ghost btn-lg" onClick={() => setQuote(null)} disabled={busy}>Cambiar</button>
            <button type="button" className="btn btn-primary btn-lg grow" onClick={confirm} disabled={busy}>{busy ? 'Procesando…' : 'Confirmar donación'}</button>
          </div>
        </div>
      ) : (
        <form onSubmit={requestQuote} className="form" noValidate>
          <div className="amount-grid">
            {presets.map((v) => (
              <button key={v} type="button" className="amount-opt num" aria-pressed={Number(amount) === v} onClick={() => setAmount(String(v))}>{v.toLocaleString('es-CO')}</button>
            ))}
          </div>
          <div className="form-grid">
            <TextField label="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <div className="field">
              <label className="label" htmlFor="demo-currency">Tu moneda</label>
              <select id="demo-currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <TextField label="Tu wallet address" icon={Wallet} value={wallet} onChange={(e) => setWallet(e.target.value)} className="mono" placeholder="$ilp.interledger-test.dev/tu-nombre" />
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Cotizando…' : 'Ver cotización'}</button>
        </form>
      )}
    </div>
  )
}
