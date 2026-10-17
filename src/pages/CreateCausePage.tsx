import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Target, Type } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { CauseCard } from '../components/CauseCard'
import { Alert, Loading, TextField } from '../components/ui'
import { formatMoney } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import type { Cause } from '../types'

const TITLE_MAX = 80
const DESCRIPTION_MAX = 600

/** "20.000.000" o "20000000" → 20000000. Solo enteros: la meta va en COP sin decimales. */
function parseGoal(text: string): number {
  const digits = text.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

export function CreateCausePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const foundationId = user?.foundationId ?? ''
  const { data: foundation, loading } = useAsync(() => api.getFoundation(foundationId), [foundationId])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<string | null>(null)
  const [goalText, setGoalText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (loading) return <Loading />
  // Regla de negocio: solo una fundación ACTIVA puede crear causas.
  if (foundation && foundation.status !== 'ACTIVA') return <Navigate to="/mi-fundacion" replace />

  const locationValue = location ?? foundation?.location ?? ''
  const currency = foundation?.currency ?? 'COP'
  const goal = parseGoal(goalText)

  /** Al editar cualquier campo se oculta el error anterior. */
  const edit = (setter: (value: string) => void) => (e: { target: { value: string } }) => {
    setError(null)
    setter(e.target.value)
  }

  const validate = (): string | null => {
    if (title.trim().length < 5) return 'El título debe tener al menos 5 caracteres.'
    if (description.trim().length < 20) return 'Cuenta en al menos 20 caracteres a qué se destinará el dinero.'
    if (!locationValue.trim()) return 'Indica dónde se usará la ayuda.'
    if (goal <= 0) return 'Define una meta mayor que cero.'
    return null
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)

    setSaving(true)
    setError(null)
    try {
      const cause = await api.createCause(foundationId, { title, description, location: locationValue, goal })
      navigate('/mi-fundacion', { state: { created: cause.title } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la causa.')
      setSaving(false)
    }
  }

  const preview: Cause = {
    id: 'vista-previa',
    foundationId,
    foundationName: foundation?.name ?? 'Tu fundación',
    title: title.trim(),
    description,
    location: locationValue.trim(),
    goal: goal || 1,
    raised: 0,
    currency,
    donationsCount: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  return (
    <div className="stack-md">
      <Link to="/mi-fundacion" className="back-link"><ArrowLeft size={16} aria-hidden />Mis causas</Link>
      <div className="page-head">
        <div>
          <h1>Crear causa</h1>
          <p>Una causa es una necesidad concreta. Los donantes ven exactamente para qué es su aporte.</p>
        </div>
      </div>

      <div className="split">
        <form onSubmit={submit} className="card card-lg form" noValidate>
          <TextField
            label="Título"
            icon={Type}
            value={title}
            onChange={edit(setTitle)}
            maxLength={TITLE_MAX}
            placeholder="Ej. Agua potable para familias de Río Claro"
            hint={`${title.length}/${TITLE_MAX}`}
          />

          <div className="field">
            <label className="label" htmlFor="cause-description">¿En qué se usará el dinero?</label>
            <textarea
              id="cause-description"
              className="textarea"
              value={description}
              onChange={edit(setDescription)}
              maxLength={DESCRIPTION_MAX}
              rows={6}
              placeholder="Qué pasó, a quién ayudarán y qué van a comprar."
            />
            <span className="hint">{description.length}/{DESCRIPTION_MAX}</span>
          </div>

          <div className="form-grid">
            <TextField label="Lugar" icon={MapPin} value={locationValue} onChange={edit(setLocation)} placeholder="Ciudad o zona, país" />
            <TextField
              label={`Meta (${currency})`}
              icon={Target}
              value={goalText}
              onChange={edit(setGoalText)}
              onBlur={() => goal > 0 && setGoalText(goal.toLocaleString('es-CO'))}
              inputMode="numeric"
              placeholder="10.000.000"
              hint={goal > 0 ? `Meta: ${formatMoney({ amount: goal, currency })}` : undefined}
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="row">
            <Link to="/mi-fundacion" className="btn btn-ghost btn-lg">Cancelar</Link>
            <button type="submit" className="btn btn-primary btn-lg grow" disabled={saving}>
              {saving ? 'Publicando…' : 'Publicar causa'}
            </button>
          </div>
        </form>

        <aside className="stack sticky" aria-label="Vista previa">
          <span className="eyebrow">Vista previa</span>
          <CauseCard cause={preview} preview />
          <p className="xsmall muted">Así verán los donantes tu causa en el listado.</p>
        </aside>
      </div>
    </div>
  )
}
