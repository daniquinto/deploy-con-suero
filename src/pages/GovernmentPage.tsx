import { useState } from 'react'
import { Building2, CheckCircle2, Clock, Landmark, Search, ShieldOff } from 'lucide-react'
import { Alert } from '../components/ui'
import type { FoundationStatus } from '../types'

/**
 * Vista de la entidad gubernamental (solo frontend, datos de ejemplo).
 * Reglas que muestra: la entidad solo ve las fundaciones que ella registró y
 * es quien las activa; una fundación PENDIENTE no puede operar.
 */
interface Row {
  id: string
  name: string
  nit: string
  city: string
  causes: number
  status: FoundationStatus
}

const ENTITY = { name: 'DAGRD Medellín', level: 'Municipal', place: 'Medellín, Antioquia' }

const INITIAL: Row[] = [
  { id: 'f1', name: 'Cruz Solidaria Antioquia', nit: '900000001-1', city: 'Medellín', causes: 3, status: 'ACTIVA' },
  { id: 'f2', name: 'Techos de Esperanza', nit: '900000003-3', city: 'Bello', causes: 0, status: 'PENDIENTE' },
  { id: 'f3', name: 'Manos que Ayudan', nit: '900000004-4', city: 'Itagüí', causes: 0, status: 'PENDIENTE' },
  { id: 'f4', name: 'Fundación Ríos de Vida', nit: '900000002-2', city: 'Envigado', causes: 2, status: 'SUSPENDIDA' },
]

const LABEL: Record<FoundationStatus, string> = { ACTIVA: 'Activa', PENDIENTE: 'Pendiente', SUSPENDIDA: 'Suspendida' }

export function GovernmentPage() {
  const [rows, setRows] = useState(INITIAL)
  const [filter, setFilter] = useState<FoundationStatus | 'TODAS'>('TODAS')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const setStatus = (id: string, status: FoundationStatus) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, status } : r)))
    const name = rows.find((r) => r.id === id)?.name
    setNotice(status === 'ACTIVA' ? `${name} quedó activa: ya puede publicar causas y recibir donaciones.` : `${name} quedó suspendida.`)
  }

  const count = (s: FoundationStatus) => rows.filter((r) => r.status === s).length
  const q = query.trim().toLowerCase()
  const visible = rows.filter((r) => (filter === 'TODAS' || r.status === filter) && (r.name.toLowerCase().includes(q) || r.nit.includes(q)))

  return (
    <div className="stack-md">
      <Alert tone="info">Vista de demostración con datos de ejemplo: los cambios no se guardan.</Alert>

      <div className="page-head">
        <div>
          <span className="eyebrow">Entidad gubernamental · {ENTITY.level}</span>
          <h1 style={{ marginTop: 6 }}>{ENTITY.name}</h1>
          <p>Fundaciones bajo tu supervisión en {ENTITY.place}. Solo una fundación activa puede operar.</p>
        </div>
        <span className="stat-icon" style={{ width: 56, height: 56 }}><Landmark aria-hidden /></span>
      </div>

      <div className="grid-3">
        <div className="card stat"><span className="stat-icon"><CheckCircle2 aria-hidden /></span><div><div className="stat-value">{count('ACTIVA')}</div><div className="muted small">Activas</div></div></div>
        <div className="card stat"><span className="stat-icon peach"><Clock aria-hidden /></span><div><div className="stat-value">{count('PENDIENTE')}</div><div className="muted small">Por revisar</div></div></div>
        <div className="card stat"><span className="stat-icon"><ShieldOff aria-hidden /></span><div><div className="stat-value">{count('SUSPENDIDA')}</div><div className="muted small">Suspendidas</div></div></div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="row-between">
        <div className="row" role="group" aria-label="Filtrar por estado">
          {(['TODAS', 'PENDIENTE', 'ACTIVA', 'SUSPENDIDA'] as const).map((s) => (
            <button key={s} type="button" className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'TODAS' ? 'Todas' : LABEL[s]}
            </button>
          ))}
        </div>
        <label className="search" style={{ maxWidth: 320 }}>
          <span className="sr-only">Buscar fundación</span>
          <Search aria-hidden />
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o NIT" />
        </label>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Fundación</th><th>Ciudad</th><th>Causas</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                    <span className="stat-icon" style={{ width: 38, height: 38 }}><Building2 aria-hidden size={18} /></span>
                    <div><div className="strong">{r.name}</div><div className="muted small">NIT {r.nit}</div></div>
                  </div>
                </td>
                <td>{r.city}</td>
                <td className="num">{r.causes}</td>
                <td><span className={`badge ${r.status}`}>{LABEL[r.status]}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {r.status === 'ACTIVA' ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(r.id, 'SUSPENDIDA')}>Suspender</button>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setStatus(r.id, 'ACTIVA')}>{r.status === 'PENDIENTE' ? 'Activar' : 'Reactivar'}</button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="center muted">No hay fundaciones con ese filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
