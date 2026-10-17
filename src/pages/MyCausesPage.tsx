import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, Eye, HandHeart, HeartHandshake, MapPin, Plus, Power, RotateCcw, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Progress } from '../components/Progress'
import { Alert, EmptyState, Loading } from '../components/ui'
import { formatDate, formatMoney } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import type { Cause } from '../types'

export function MyCausesPage() {
  const { user } = useAuth()
  const location = useLocation()
  const created = (location.state as { created?: string } | null)?.created
  const foundationId = user?.foundationId ?? ''

  const [reload, setReload] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, loading, error } = useAsync(
    () => Promise.all([api.getFoundation(foundationId), api.listCausesByFoundation(foundationId), api.donationsByFoundation(foundationId)]),
    [foundationId, reload],
  )

  if (loading && !data) return <Loading />
  if (error) return <Alert tone="error">{error}</Alert>

  const [foundation, causes, donations] = data ?? [null, [], []]
  if (!foundation) return <Alert tone="error">No encontramos el perfil de tu fundación.</Alert>

  const isActive = foundation.status === 'ACTIVA'
  const active = causes.filter((c) => c.status === 'active')
  const totalRaised = causes.reduce((sum, c) => sum + c.raised, 0)
  const totalDonations = causes.reduce((sum, c) => sum + c.donationsCount, 0)

  const toggleStatus = async (cause: Cause) => {
    setBusyId(cause.id)
    setActionError(null)
    try {
      await api.setCauseStatus(cause.id, cause.status === 'active' ? 'closed' : 'active')
      setReload((n) => n + 1)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar la causa.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack-md">
      <div className="page-head">
        <div>
          <span className="eyebrow">{foundation.name}</span>
          <h1 style={{ marginTop: 6 }}>Mis causas</h1>
          <p>Publica tus necesidades y sigue cuánto has recibido en cada una.</p>
        </div>
        <div className="row">
          <span className={`badge ${foundation.status}`}>
            {foundation.status === 'ACTIVA' ? 'Fundación activa' : foundation.status === 'PENDIENTE' ? 'Pendiente de activación' : 'Suspendida'}
          </span>
          {isActive && <Link to="/mi-fundacion/causas/nueva" className="btn btn-primary btn-lg"><Plus aria-hidden />Crear causa</Link>}
        </div>
      </div>

      {created && <Alert tone="success">La causa «{created}» quedó publicada y ya aparece en el listado público.</Alert>}
      {!isActive && (
        <Alert tone="warning">
          Tu fundación está pendiente de activación por una entidad gubernamental. Mientras tanto no puedes publicar causas ni recibir donaciones.
        </Alert>
      )}
      {isActive && !foundation.walletAddress && (
        <Alert tone="info">Aún no registras la wallet address de la fundación. Tus causas se ven, pero la necesitarás para recibir el dinero liberado.</Alert>
      )}

      <div className="grid-3">
        <div className="card stat">
          <span className="stat-icon"><Wallet aria-hidden /></span>
          <div><div className="stat-value">{formatMoney({ amount: totalRaised, currency: foundation.currency })}</div><div className="muted small">Recaudado en total</div></div>
        </div>
        <div className="card stat">
          <span className="stat-icon peach"><HandHeart aria-hidden /></span>
          <div><div className="stat-value">{active.length} <span className="muted small">de {causes.length}</span></div><div className="muted small">Causas activas</div></div>
        </div>
        <div className="card stat">
          <span className="stat-icon"><HeartHandshake aria-hidden /></span>
          <div><div className="stat-value">{totalDonations}</div><div className="muted small">Donaciones recibidas</div></div>
        </div>
      </div>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {causes.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Aún no tienes causas"
          action={isActive ? <Link to="/mi-fundacion/causas/nueva" className="btn btn-primary btn-lg"><Plus aria-hidden />Crear mi primera causa</Link> : undefined}
        >
          Una causa es una necesidad concreta: los donantes ven exactamente para qué es su aporte.
        </EmptyState>
      ) : (
        <ul className="list">
          {causes.map((cause) => (
            <li key={cause.id} className="card list-row">
              <div className="grow stack-sm">
                <div className="row-between">
                  <h3>{cause.title}</h3>
                  <span className={`badge ${cause.status}`}>{cause.status === 'active' ? 'Activa' : 'Cerrada'}</span>
                </div>
                <div className="row small muted" style={{ gap: 16 }}>
                  <span className="cause-meta"><MapPin aria-hidden />{cause.location}</span>
                  <span className="cause-meta"><CalendarDays aria-hidden />{formatDate(cause.createdAt)}</span>
                  <span className="cause-meta"><HeartHandshake aria-hidden />{cause.donationsCount} donaciones</span>
                </div>
                <Progress raised={cause.raised} goal={cause.goal} currency={cause.currency} showGoal />
              </div>
              <div className="row">
                <Link to={`/causas/${cause.id}`} className="btn btn-ghost btn-sm"><Eye aria-hidden />Ver pública</Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleStatus(cause)} disabled={busyId === cause.id || (cause.status === 'closed' && !isActive)}>
                  {cause.status === 'active' ? <Power aria-hidden /> : <RotateCcw aria-hidden />}
                  {busyId === cause.id ? 'Guardando…' : cause.status === 'active' ? 'Cerrar' : 'Reactivar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {donations.length > 0 && (
        <section className="stack">
          <h2>Últimas donaciones</h2>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Causa</th><th>Donó</th><th>Recibiste</th></tr></thead>
              <tbody>
                {donations.slice(0, 10).map((d) => (
                  <tr key={d.id}>
                    <td className="muted">{formatDate(d.createdAt)}</td>
                    <td className="strong">{d.causeTitle}</td>
                    <td className="num">{formatMoney(d.sent)}</td>
                    <td className="num strong">{formatMoney(d.received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
