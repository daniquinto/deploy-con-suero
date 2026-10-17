import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, CalendarDays, HandHeart, HeartHandshake, MapPin, ShieldCheck, Users, Wallet } from 'lucide-react'
import { CauseCover } from '../components/CauseCard'
import { Progress } from '../components/Progress'
import { Alert, EmptyState, Loading } from '../components/ui'
import { formatDate } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'

export function CauseDetailPage() {
  const { id = '' } = useParams()
  const { data, loading, error } = useAsync(async () => {
    const cause = await api.getCause(id)
    const foundation = cause ? await api.getFoundation(cause.foundationId) : null
    return { cause, foundation }
  }, [id])

  if (loading) return <Loading />
  if (error) return <Alert tone="error">{error}</Alert>

  const { cause, foundation } = data ?? { cause: null, foundation: null }
  if (!cause) {
    return (
      <EmptyState icon={HandHeart} title="Causa no encontrada" action={<Link to="/causas" className="btn btn-primary">Ver causas activas</Link>}>
        Puede que el enlace esté mal escrito o que la causa ya no exista.
      </EmptyState>
    )
  }

  const active = cause.status === 'active'

  return (
    <div className="stack-md">
      <Link to="/causas" className="back-link"><ArrowLeft size={16} aria-hidden />Causas</Link>

      <div className="split">
        <div className="stack-md">
          <CauseCover cause={cause} className="detail-cover" />

          <div className="stack-sm">
            <h1>{cause.title}</h1>
            <div className="row muted small">
              <span className="cause-meta"><MapPin aria-hidden />{cause.location}</span>
              <span className="cause-meta"><CalendarDays aria-hidden />Publicada el {formatDate(cause.createdAt)}</span>
            </div>
          </div>

          <section className="card stack">
            <h2 className="section-title"><HandHeart aria-hidden />¿En qué se usará tu aporte?</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{cause.description}</p>
            {!!cause.fundsUse?.length && (
              <ol className="uses">
                {cause.fundsUse.map((use, i) => <li key={use}><span>{i + 1}</span><span>{use}</span></li>)}
              </ol>
            )}
          </section>

          {foundation && (
            <section className="card stack">
              <h2 className="section-title"><Building2 aria-hidden />Sobre {foundation.name}</h2>
              {foundation.location && <span className="cause-meta"><MapPin aria-hidden />{foundation.location}</span>}
              {foundation.description ? <p>{foundation.description}</p> : <p className="muted">Esta fundación aún no ha agregado una descripción.</p>}
              <div className="row">
                <span className={`badge ${foundation.status}`}>{foundation.status === 'ACTIVA' ? 'Fundación activa' : 'Fundación pendiente'}</span>
              </div>
            </section>
          )}
        </div>

        <aside className="card card-lg stack sticky" aria-label="Donar">
          <span className="eyebrow">Recaudado</span>
          <Progress raised={cause.raised} goal={cause.goal} currency={cause.currency} showGoal />
          <dl className="kv">
            <dt className="cause-meta"><Users aria-hidden />Donantes</dt>
            <dd className="num">{cause.donationsCount}</dd>
            {cause.beneficiaries && (
              <>
                <dt className="cause-meta"><HeartHandshake aria-hidden />Beneficiarios</dt>
                <dd className="num">{cause.beneficiaries}</dd>
              </>
            )}
            {cause.deadline && (
              <>
                <dt className="cause-meta"><CalendarDays aria-hidden />Hasta</dt>
                <dd>{new Date(`${cause.deadline}T12:00:00`).toLocaleDateString('es-CO', { dateStyle: 'long' })}</dd>
              </>
            )}
            <dt className="cause-meta"><Wallet aria-hidden />Recibe en</dt>
            <dd className="mono small">{foundation?.walletAddress ? foundation.walletAddress.replace('https://', '') : 'Wallet pendiente'}</dd>
          </dl>
          {active ? (
            <Link to={`/causas/${cause.id}/donar`} className="btn btn-primary btn-lg btn-block">Donar a esta causa</Link>
          ) : (
            <Alert tone="warning">Esta causa está cerrada y ya no recibe donaciones.</Alert>
          )}
          <p className="xsmall muted row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <ShieldCheck size={16} aria-hidden style={{ flex: 'none', color: 'var(--primary)' }} />
            Tu aporte llega a la wallet de Mano Abierta y se entrega a la fundación de forma controlada.
          </p>
        </aside>
      </div>
    </div>
  )
}
