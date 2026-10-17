import { Link } from 'react-router-dom'
import { HandHeart, MapPin, Users } from 'lucide-react'
import type { Cause } from '../types'
import { Progress } from './Progress'
import { coverClass } from './ui'

/** Portada: la foto de la causa si la tiene; si no, un degradado de marca. */
export function CauseCover({ cause, className = 'cause-cover' }: { cause: Cause; className?: string }) {
  return (
    <div className={`${className} ${cause.imageUrl ? 'has-img' : coverClass(cause.id)}`}>
      {cause.imageUrl ? (
        <img src={cause.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="cover-icon" aria-hidden><HandHeart /></span>
      )}
      <div className="row" style={{ gap: 6, position: 'relative' }}>
        {cause.category && <span className="chip">{cause.category}</span>}
        <span className="chip">{cause.foundationName}</span>
      </div>
    </div>
  )
}

export function CauseCard({ cause, preview }: { cause: Cause; preview?: boolean }) {
  return (
    <article className="card card-hover cause-card">
      <CauseCover cause={cause} />
      <div className="cause-body">
        <div className="stack-sm">
          <h3>{cause.title || 'Título de la causa'}</h3>
          <div className="row small muted" style={{ gap: 14 }}>
            <span className="cause-meta"><MapPin aria-hidden />{cause.location || 'Lugar'}</span>
            {cause.donationsCount > 0 && <span className="cause-meta"><Users aria-hidden />{cause.donationsCount} donantes</span>}
          </div>
        </div>
        <Progress raised={cause.raised} goal={cause.goal} currency={cause.currency} />
        {!preview && (
          <div className="cause-foot">
            <Link to={`/causas/${cause.id}`} className="btn btn-ghost">Ver detalle</Link>
            <Link to={`/causas/${cause.id}/donar`} className="btn btn-primary">Donar</Link>
          </div>
        )}
      </div>
    </article>
  )
}
