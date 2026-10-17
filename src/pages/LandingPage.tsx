import { Link } from 'react-router-dom'
import { ArrowRight, Eye, Globe, HandHeart, HeartHandshake, MapPin, ShieldCheck, Timer, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { CauseCard } from '../components/CauseCard'
import { Progress } from '../components/Progress'
import { EmptyState, Loading } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'

export function LandingPage() {
  const { user } = useAuth()
  const { data: causes, loading, error } = useAsync(() => api.listActiveCauses(), [])
  const featured = causes?.[0]

  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="stack-md">
          <span className="eyebrow">Donaciones para emergencias</span>
          <h1>
            Tu ayuda llega <em>en minutos</em>, no en semanas.
          </h1>
          <p className="lead">
            Dona desde cualquier país, en tu moneda, a causas concretas de fundaciones que atienden emergencias.
            Cada peso queda registrado para que sepas en qué se convirtió.
          </p>
          <div className="row">
            <Link to="/causas" className="btn btn-primary btn-lg">
              Quiero donar <ArrowRight aria-hidden />
            </Link>
            {!user && <Link to="/registro?tipo=fundacion" className="btn btn-ghost btn-lg">Soy una fundación</Link>}
          </div>
          <div className="hero-trust">
            <span><Timer aria-hidden />Llega en minutos</span>
            <span><Globe aria-hidden />Desde cualquier país</span>
            <span><Eye aria-hidden />Gasto visible</span>
          </div>
        </div>

        <div className="hero-visual" aria-hidden={!featured}>
          <div className="bg" />
          {featured ? (
            <>
              <div className="card card-lg stack" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <span className="eyebrow">Causa destacada</span>
                <h2>{featured.title}</h2>
                <span className="cause-meta"><MapPin aria-hidden />{featured.location} · {featured.foundationName}</span>
                <Progress raised={featured.raised} goal={featured.goal} currency={featured.currency} showGoal />
                <Link to={`/causas/${featured.id}/donar`} className="btn btn-accent btn-block">Donar a esta causa</Link>
              </div>
              <div className="float-note">
                <span className="dot"><HeartHandshake aria-hidden /></span>
                <span><strong>{featured.donationsCount} personas</strong> ya ayudaron a esta causa</span>
              </div>
            </>
          ) : (
            <div className="card card-lg" style={{ minHeight: 260 }} />
          )}
        </div>
      </section>

      <section className="stack-md">
        <div className="page-head">
          <div>
            <span className="eyebrow">Cómo funciona</span>
            <h2 style={{ fontSize: '1.8rem', marginTop: 6 }}>Tres pasos, sin intermediarios</h2>
          </div>
        </div>
        <div className="steps-grid">
          <div className="card step-card">
            <span className="step-icon"><HandHeart aria-hidden /></span>
            <h3>1. Elige una causa</h3>
            <p className="muted">Causas concretas de fundaciones verificadas: alimentos, agua, refugio, salud.</p>
          </div>
          <div className="card step-card">
            <span className="step-icon"><Wallet aria-hidden /></span>
            <h3>2. Dona en tu moneda</h3>
            <p className="muted">Ves cuánto pagas y cuánto recibe la fundación antes de aprobar desde tu wallet.</p>
          </div>
          <div className="card step-card">
            <span className="step-icon"><ShieldCheck aria-hidden /></span>
            <h3>3. Sigue cada peso</h3>
            <p className="muted">La fundación compra en comercios locales y cada gasto queda enlazado a tu aporte.</p>
          </div>
        </div>
      </section>

      <section className="stack-md">
        <div className="page-head">
          <div>
            <span className="eyebrow">Opciones para donar</span>
            <h2 style={{ fontSize: '1.8rem', marginTop: 6 }}>Causas que necesitan ayuda hoy</h2>
          </div>
          <Link to="/causas" className="btn btn-ghost">Ver todas <ArrowRight aria-hidden /></Link>
        </div>
        {loading && <Loading label="Cargando causas…" />}
        {error && <p className="error">{error}</p>}
        {causes?.length === 0 && (
          <EmptyState icon={HandHeart} title="Aún no hay causas activas">
            Cuando una fundación publique una causa, aparecerá aquí.
          </EmptyState>
        )}
        <div className="grid">
          {causes?.slice(0, 3).map((c) => <CauseCard key={c.id} cause={c} />)}
        </div>
      </section>

      {user?.role !== 'foundation' && (
        <section className="band">
          <div>
            <h2>¿Eres una fundación?</h2>
            <p>Regístrate, publica tus causas y recibe aportes de todo el mundo con total transparencia.</p>
          </div>
          <Link to="/registro?tipo=fundacion" className="btn btn-accent btn-lg">Registrar mi fundación</Link>
        </section>
      )}
    </div>
  )
}
