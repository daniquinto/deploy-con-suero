import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Hash, Heart, HandHeart, IdCard, Lock, Mail, ShieldCheck, Timer, Globe, User, UserRound, Users } from 'lucide-react'
import { homeFor, useAuth } from '../auth/AuthContext'
import { Logo } from '../components/Logo'
import { Alert, PasswordField, SelectField, TextField } from '../components/ui'
import { isDemoMode } from '../services/api'
import { DEMO_ACCOUNTS } from '../services/mockApi'
import {
  DOCUMENT_TYPES,
  FOUNDATION_ID_TYPES,
  GENDERS,
  type DocumentType,
  type FoundationIdType,
  type Gender,
  type RegisterInput,
  type Role,
} from '../types'

interface Props {
  mode: 'login' | 'register'
}

const EMPTY = {
  // Donante
  firstNames: '',
  lastNames: '',
  documentType: '',
  documentNumber: '',
  gender: '',
  // Fundación
  name: '',
  legalRepresentative: '',
  idType: '',
  idNumber: '',
  // Comunes
  email: '',
  password: '',
  confirmPassword: '',
}

type Form = typeof EMPTY
type Errors = Partial<Record<keyof Form, string>>

const DOC_RE = /^[0-9A-Za-z.-]{4,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(mode: Props['mode'], role: Role, f: Form): Errors {
  const e: Errors = {}
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Escribe un correo válido.'
  if (mode === 'login') {
    if (!f.password) e.password = 'Escribe tu contraseña.'
    return e
  }
  if (role === 'donor') {
    if (f.firstNames.trim().length < 2) e.firstNames = 'Escribe tus nombres.'
    if (f.lastNames.trim().length < 2) e.lastNames = 'Escribe tus apellidos.'
    if (!f.documentType) e.documentType = 'Elige el tipo de documento.'
    if (!DOC_RE.test(f.documentNumber.trim())) e.documentNumber = 'Entre 4 y 20 caracteres, sin espacios.'
    if (!f.gender) e.gender = 'Elige una opción.'
  } else {
    if (f.name.trim().length < 2) e.name = 'Escribe el nombre de la fundación.'
    if (f.legalRepresentative.trim().length < 3) e.legalRepresentative = 'Escribe la persona responsable.'
    if (!f.idType) e.idType = 'Elige el tipo de identificación.'
    if (!DOC_RE.test(f.idNumber.trim())) e.idNumber = 'Entre 4 y 20 caracteres, sin espacios.'
  }
  if (f.password.length < 8) e.password = 'Mínimo 8 caracteres.'
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Las contraseñas no coinciden.'
  return e
}

function toRegisterInput(role: Role, f: Form): RegisterInput {
  const common = { email: f.email.trim(), password: f.password }
  return role === 'donor'
    ? {
        role,
        firstNames: f.firstNames.trim(),
        lastNames: f.lastNames.trim(),
        documentType: f.documentType as DocumentType,
        documentNumber: f.documentNumber.trim(),
        gender: f.gender as Gender,
        ...common,
      }
    : {
        role,
        name: f.name.trim(),
        legalRepresentative: f.legalRepresentative.trim(),
        idType: f.idType as FoundationIdType,
        idNumber: f.idNumber.trim(),
        ...common,
      }
}

export function AuthPage({ mode }: Props) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const from = (location.state as { from?: string } | null)?.from

  const [role, setRole] = useState<Role>(params.get('tipo') === 'fundacion' ? 'foundation' : 'donor')
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isRegister = mode === 'register'
  const isFoundation = isRegister && role === 'foundation'
  const demoAccount = isDemoMode ? DEMO_ACCOUNTS.find((a) => a.role === role) : undefined

  const chooseRole = (next: Role) => {
    setRole(next)
    setErrors({})
    setServerError(null)
  }

  const fillDemo = () => {
    if (!demoAccount) return
    setForm((f) => ({ ...f, email: demoAccount.email, password: demoAccount.password }))
    setErrors({})
  }

  const bind = (field: keyof Form) => ({
    value: form[field],
    error: errors[field],
    onChange: (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [field]: e.target.value }))
      if (errors[field]) setErrors(({ [field]: _gone, ...rest }) => rest)
    },
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validate(mode, role, form)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length) return

    setSubmitting(true)
    try {
      const user = isRegister ? await register(toRegisterInput(role, form)) : await login(form.email.trim(), form.password, role)
      navigate(from ?? homeFor(user), { replace: true })
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'No se pudo completar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Logo />
        <div className="stack-md">
          <h2>Ayuda que llega hoy. Y lo puedes ver.</h2>
          <p>Conectamos a donantes de todo el mundo con fundaciones que atienden emergencias, con cada aporte a la vista.</p>
          <ul className="auth-points">
            <li>
              <span className="pt-icon"><Timer aria-hidden /></span>
              <div><strong>En minutos, no en semanas</strong><span>La ayuda cruza fronteras al instante con Open Payments.</span></div>
            </li>
            <li>
              <span className="pt-icon"><Globe aria-hidden /></span>
              <div><strong>Desde cualquier país</strong><span>Donas en tu moneda; la conversión es automática.</span></div>
            </li>
            <li>
              <span className="pt-icon"><ShieldCheck aria-hidden /></span>
              <div><strong>Transparencia real</strong><span>Ves en qué se convirtió cada peso que donaste.</span></div>
            </li>
          </ul>
        </div>
        <span className="small" style={{ color: '#a9c4b4' }}>Mano Abierta · Hackathon Open Payments 2026</span>
        <span className="blob" aria-hidden />
      </aside>

      <main className="auth-main">
        <div className="auth-panel">
          <nav className="auth-tabs" aria-label="Acceso">
            <Link to="/ingresar" state={location.state} className={!isRegister ? 'active' : ''} aria-current={!isRegister ? 'page' : undefined}>
              Ingresar
            </Link>
            <Link to="/registro" state={location.state} className={isRegister ? 'active' : ''} aria-current={isRegister ? 'page' : undefined}>
              Crear cuenta
            </Link>
          </nav>

          <form onSubmit={submit} className="form" noValidate>
            <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="stack-xs" style={{ padding: 0, marginBottom: 12 }}>
                <span className="strong">{isRegister ? '¿Cómo quieres participar?' : '¿Cómo quieres ingresar?'}</span>
                <span className="muted small">
                  {isRegister ? 'Elige el tipo de cuenta que mejor describe tu propósito.' : 'Elige el tipo de cuenta con la que te registraste.'}
                </span>
              </legend>
              <div className="role-picker">
                <label className={`role-option ${role === 'donor' ? 'selected' : ''}`}>
                  <input type="radio" name="role" checked={role === 'donor'} onChange={() => chooseRole('donor')} />
                  <Heart aria-hidden />
                  <strong>Soy donante</strong>
                  <span>Quiero apoyar causas</span>
                </label>
                <label className={`role-option ${role === 'foundation' ? 'selected' : ''}`}>
                  <input type="radio" name="role" checked={role === 'foundation'} onChange={() => chooseRole('foundation')} />
                  <HandHeart aria-hidden />
                  <strong>Soy fundación</strong>
                  <span>Quiero recibir aportes</span>
                </label>
              </div>
            </fieldset>

            {isRegister ? (
              <>
                <div className="stack-xs" style={{ marginTop: 10 }}>
                  <h1 style={{ fontSize: '1.5rem' }}>{isFoundation ? 'Datos de la fundación' : 'Datos personales'}</h1>
                  <p className="muted small">
                    {isFoundation
                      ? 'Registra tu organización para recibir aportes con transparencia.'
                      : 'Completa la información para crear tu cuenta.'}
                  </p>
                </div>

                {isFoundation ? (
                  <>
                    <TextField label="Nombre de la fundación" hideLabel icon={HandHeart} autoComplete="organization" {...bind('name')} />
                    <TextField label="Persona responsable" hideLabel icon={UserRound} autoComplete="name" {...bind('legalRepresentative')} />
                    <SelectField label="Tipo de identificación" hideLabel icon={IdCard} options={FOUNDATION_ID_TYPES} {...bind('idType')} />
                    <TextField label="NIT / número de identificación" hideLabel icon={Hash} {...bind('idNumber')} />
                  </>
                ) : (
                  <>
                    <div className="form-grid">
                      <TextField label="Nombres" hideLabel icon={UserRound} autoComplete="given-name" {...bind('firstNames')} />
                      <TextField label="Apellidos" hideLabel icon={User} autoComplete="family-name" {...bind('lastNames')} />
                    </div>
                    <SelectField label="Tipo de documento" hideLabel icon={IdCard} options={DOCUMENT_TYPES} {...bind('documentType')} />
                    <TextField label="Número de documento" hideLabel icon={Hash} inputMode="text" {...bind('documentNumber')} />
                    <SelectField label="Género" hideLabel icon={Users} options={GENDERS} {...bind('gender')} />
                  </>
                )}

                <TextField label="Correo electrónico" hideLabel icon={Mail} type="email" autoComplete="email" {...bind('email')} />
                <PasswordField label="Contraseña" hideLabel icon={Lock} autoComplete="new-password" hint="Mínimo 8 caracteres." {...bind('password')} />
                <PasswordField label="Confirmar contraseña" hideLabel icon={Lock} autoComplete="new-password" {...bind('confirmPassword')} />
              </>
            ) : (
              <>
                <div className="stack-xs" style={{ marginTop: 10 }}>
                  <h1 style={{ fontSize: '1.6rem' }}>Bienvenido de nuevo</h1>
                  <p className="muted small">
                    {role === 'donor' ? 'Ingresa para ver las causas activas y tus donaciones.' : 'Ingresa para gestionar las causas de tu fundación.'}
                  </p>
                </div>
                <TextField label="Correo electrónico" hideLabel icon={Mail} type="email" autoComplete="email" {...bind('email')} />
                <PasswordField label="Contraseña" hideLabel icon={Lock} autoComplete="current-password" {...bind('password')} />
                {demoAccount && (
                  <div className="alert alert-info" style={{ alignItems: 'center' }}>
                    <span className="grow small">
                      Cuenta de prueba: <span className="strong">{demoAccount.email}</span> · contraseña <span className="strong">{demoAccount.password}</span>
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={fillDemo}>Usar</button>
                  </div>
                )}
              </>
            )}

            {serverError && <Alert tone="error">{serverError}</Alert>}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting} style={{ marginTop: 6 }}>
              {submitting ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Ingresar'}
            </button>

            <p className="center small">
              {isRegister ? (
                <Link to="/ingresar" state={location.state}>Ya tengo una cuenta</Link>
              ) : (
                <>¿Aún no tienes cuenta? <Link to="/registro" state={location.state}>Créala gratis</Link></>
              )}
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
