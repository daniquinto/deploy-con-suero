import { Link } from 'react-router-dom'
import { HandHeart, HeartHandshake, ReceiptText, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert, EmptyState, Loading } from '../components/ui'
import { formatDate, formatMoney } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'

const STATUS = { pending: 'Pendiente', completed: 'Completada', failed: 'Fallida' } as const

export function MyDonationsPage() {
  const { user } = useAuth()
  const { data: donations, loading, error } = useAsync(() => api.donationsByDonor(user!.id), [user?.id])

  const completed = donations?.filter((d) => d.status === 'completed') ?? []
  const causes = new Set(completed.map((d) => d.causeId)).size

  return (
    <div className="stack-md">
      <div className="page-head">
        <div>
          <h1>Mis donaciones</h1>
          <p>Cada aporte que hiciste y a qué causa llegó.</p>
        </div>
        <Link to="/causas" className="btn btn-primary"><HandHeart aria-hidden />Donar de nuevo</Link>
      </div>

      {loading && <Loading />}
      {error && <Alert tone="error">{error}</Alert>}

      {donations && donations.length > 0 && (
        <div className="grid-3">
          <div className="card stat">
            <span className="stat-icon"><ReceiptText aria-hidden /></span>
            <div><div className="stat-value">{donations.length}</div><div className="muted small">Donaciones</div></div>
          </div>
          <div className="card stat">
            <span className="stat-icon peach"><HeartHandshake aria-hidden /></span>
            <div><div className="stat-value">{causes}</div><div className="muted small">Causas apoyadas</div></div>
          </div>
          <div className="card stat">
            <span className="stat-icon"><Sparkles aria-hidden /></span>
            <div><div className="stat-value">{completed.length}</div><div className="muted small">Ya entregadas</div></div>
          </div>
        </div>
      )}

      {donations?.length === 0 && (
        <EmptyState
          icon={HeartHandshake}
          title="Aún no has donado"
          action={<Link to="/causas" className="btn btn-primary btn-lg">Ver causas activas</Link>}
        >
          Cuando dones, aquí verás cada aporte y en qué se convirtió.
        </EmptyState>
      )}

      {!!donations?.length && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Causa</th><th>Fecha</th><th>Pagaste</th><th>Recibió la fundación</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {donations.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/causas/${d.causeId}`} className="strong">{d.causeTitle}</Link>
                    <div className="muted small">{d.foundationName}</div>
                  </td>
                  <td className="muted">{formatDate(d.createdAt)}</td>
                  <td className="num strong">{formatMoney(d.sent)}</td>
                  <td className="num">{formatMoney(d.received)}</td>
                  <td><span className={`badge ${d.status}`}>{STATUS[d.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
