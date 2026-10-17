import { useState, type FormEvent } from 'react'
import { Building2, Hash, HandHeart, Landmark, Mail, MapPin, Plus, Users, Wallet } from 'lucide-react'
import { Alert, SelectField, TextField } from '../components/ui'
import { formatMoney } from '../lib/format'

/**
 * Vista del administrador (dueño del negocio). Solo frontend, datos de ejemplo.
 * Regla que muestra: solo el admin registra entidades gubernamentales.
 */
interface Entity {
  id: string
  name: string
  nit: string
  level: string
  place: string
  email: string
  foundations: number
}

const LEVELS = [
  { value: 'NACIONAL', label: 'Nacional' },
  { value: 'DEPARTAMENTAL', label: 'Departamental' },
  { value: 'MUNICIPAL', label: 'Municipal' },
]

const INITIAL: Entity[] = [
  { id: 'e1', name: 'DAGRD Medellín', nit: '800000001-1', level: 'Municipal', place: 'Medellín, Antioquia', email: 'riesgo@medellin.gov.co', foundations: 4 },
  { id: 'e2', name: 'Unidad Nacional para la Gestión del Riesgo', nit: '800000002-2', level: 'Nacional', place: 'Colombia', email: 'emergencias@gestionriesgo.gov.co', foundations: 7 },
  { id: 'e3', name: 'Gobernación del Chocó', nit: '800000003-3', level: 'Departamental', place: 'Quibdó, Chocó', email: 'riesgo@choco.gov.co', foundations: 2 },
]

const EMPTY = { name: '', nit: '', level: '', place: '', email: '' }

export function AdminPage() {
  const [entities, setEntities] = useState(INITIAL)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const set = (field: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setError(null)
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 3) return setError('Escribe el nombre de la entidad.')
    if (!/^[0-9.-]{6,20}$/.test(form.nit.trim())) return setError('Escribe un NIT válido.')
    if (!form.level) return setError('Elige el nivel de gobierno.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Escribe un correo institucional válido.')

    const level = LEVELS.find((l) => l.value === form.level)!.label
    setEntities((list) => [
      { id: crypto.randomUUID(), name: form.name.trim(), nit: form.nit.trim(), level, place: form.place.trim() || '—', email: form.email.trim(), foundations: 0 },
      ...list,
    ])
    setNotice(`${form.name.trim()} quedó registrada. Le enviaremos una invitación a ${form.email.trim()}.`)
    setForm(EMPTY)
  }

  return (
    <div className="stack-md">
      <Alert tone="info">Vista de demostración con datos de ejemplo: los cambios no se guardan.</Alert>

      <div className="page-head">
        <div>
          <span className="eyebrow">Administración</span>
          <h1 style={{ marginTop: 6 }}>Panel de Mano Abierta</h1>
          <p>Solo el administrador puede registrar entidades gubernamentales.</p>
        </div>
      </div>

      <div className="grid-3">
        <div className="card stat"><span className="stat-icon"><Landmark aria-hidden /></span><div><div className="stat-value">{entities.length}</div><div className="muted small">Entidades</div></div></div>
        <div className="card stat"><span className="stat-icon peach"><Building2 aria-hidden /></span><div><div className="stat-value">{entities.reduce((s, e) => s + e.foundations, 0)}</div><div className="muted small">Fundaciones</div></div></div>
        <div className="card stat"><span className="stat-icon"><HandHeart aria-hidden /></span><div><div className="stat-value">18</div><div className="muted small">Causas activas</div></div></div>
        <div className="card stat"><span className="stat-icon peach"><Wallet aria-hidden /></span><div><div className="stat-value">{formatMoney({ amount: 48_250_000, currency: 'COP' })}</div><div className="muted small">Recaudado</div></div></div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="split">
        <section className="stack">
          <h2>Entidades registradas</h2>
          <ul className="list">
            {entities.map((e) => (
              <li key={e.id} className="card list-row">
                <span className="stat-icon"><Landmark aria-hidden /></span>
                <div className="grow stack-xs">
                  <div className="row-between">
                    <h3>{e.name}</h3>
                    <span className="chip">{e.level}</span>
                  </div>
                  <div className="row small muted" style={{ gap: 16 }}>
                    <span className="cause-meta"><Hash aria-hidden />NIT {e.nit}</span>
                    <span className="cause-meta"><MapPin aria-hidden />{e.place}</span>
                    <span className="cause-meta"><Users aria-hidden />{e.foundations} fundaciones</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={submit} className="card card-lg form sticky" noValidate>
          <h2 className="section-title"><Plus aria-hidden />Registrar entidad</h2>
          <TextField label="Nombre de la entidad" icon={Landmark} value={form.name} onChange={set('name')} />
          <TextField label="NIT" icon={Hash} value={form.nit} onChange={set('nit')} placeholder="800000000-0" />
          <SelectField label="Nivel de gobierno" options={LEVELS} value={form.level} onChange={set('level')} />
          <TextField label="Ciudad o región" icon={MapPin} value={form.place} onChange={set('place')} />
          <TextField label="Correo institucional" icon={Mail} type="email" value={form.email} onChange={set('email')} placeholder="riesgo@entidad.gov.co" />
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" className="btn btn-primary btn-lg btn-block">Registrar entidad</button>
        </form>
      </div>
    </div>
  )
}
