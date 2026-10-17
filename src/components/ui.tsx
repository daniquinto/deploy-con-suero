import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, TriangleAlert, type LucideIcon } from 'lucide-react'

interface FieldBase {
  /** Texto de la etiqueta. Con `hideLabel`, solo lo leen los lectores de pantalla (el placeholder la reemplaza). */
  label: string
  hideLabel?: boolean
  icon?: LucideIcon
  hint?: ReactNode
  error?: string | null
}

function FieldShell({ id, label, hideLabel, hint, error, children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'}>{label}</label>
      {children}
      {error ? <span id={`${id}-err`} className="field-error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

type TextFieldProps = FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>

export function TextField({ label, hideLabel, icon: Icon, hint, error, className, ...input }: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="input-wrap">
        {Icon && <Icon className="input-icon" aria-hidden />}
        <input
          id={id}
          className={`input ${className ?? ''}`}
          placeholder={hideLabel ? label : input.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...input}
        />
      </div>
    </FieldShell>
  )
}

export function PasswordField({ label, hideLabel, icon: Icon, hint, error, ...input }: TextFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="input-wrap">
        {Icon && <Icon className="input-icon" aria-hidden />}
        <input
          id={id}
          className="input has-action"
          type={visible ? 'text' : 'password'}
          placeholder={hideLabel ? label : input.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...input}
        />
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
    </FieldShell>
  )
}

type SelectFieldProps = FieldBase &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
    options: { value: string; label: string }[]
    /** Texto de la opción vacía inicial. */
    placeholder?: string
  }

export function SelectField({ label, hideLabel, icon: Icon, hint, error, options, placeholder, ...select }: SelectFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="input-wrap">
        {Icon && <Icon className="input-icon" aria-hidden />}
        <select
          id={id}
          className="select"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          {...select}
        >
          <option value="" disabled>{placeholder ?? (hideLabel ? label : 'Selecciona…')}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </FieldShell>
  )
}

const ALERT_ICONS = { error: AlertCircle, success: CheckCircle2, warning: TriangleAlert, info: Info }

export function Alert({ tone = 'info', children }: { tone?: keyof typeof ALERT_ICONS; children: ReactNode }) {
  const Icon = ALERT_ICONS[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <span className="empty-icon"><Icon aria-hidden /></span>
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <p className="muted center" role="status">{label}</p>
}

/** Iniciales para el avatar: "Laura Gómez" → "LG". */
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '·'
}

/** Elige una de 4 portadas de forma estable según el id. */
export function coverClass(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `cover-${h % 4}`
}
