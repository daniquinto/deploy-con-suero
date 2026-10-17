import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, IdCard, Lock, Mail, Trash2, User, UserRound, Users, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert, Loading, PasswordField, SelectField, TextField, initials } from '../components/ui'
import { formatDate, isValidWallet } from '../lib/format'
import { api, SUPPORTED_CURRENCIES } from '../services/api'
import { DOCUMENT_TYPES, GENDERS, type DonorProfile, type Gender } from '../types'

const COUNTRIES = [
  { value: 'CO', label: 'Colombia' },
  { value: 'MX', label: 'México' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'PE', label: 'Perú' },
  { value: 'AR', label: 'Argentina' },
  { value: 'CL', label: 'Chile' },
  { value: 'ES', label: 'España' },
  { value: 'US', label: 'Estados Unidos' },
  { value: 'CA', label: 'Canadá' },
  { value: 'DE', label: 'Alemania' },
]

type Tab = 'personal' | 'wallet' | 'security'

export function DonorProfilePage() {
  const { refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<DonorProfile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('personal')

  useEffect(() => {
    api.getMyDonorProfile().then(setProfile).catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil.'))
  }, [])

  if (loadError) return <Alert tone="error">{loadError}</Alert>
  if (!profile) return <Loading />

  const onSaved = async (next: DonorProfile) => {
    setProfile(next)
    await refreshUser()
  }

  return (
    <div className="narrow stack-md" style={{ maxWidth: 760 }}>
      <div className="profile-head">
        <span className="avatar lg" aria-hidden>{initials(profile.name)}</span>
        <div className="stack-xs">
          <h1>{profile.name}</h1>
          <span className="muted small">{profile.email} · Donante desde {formatDate(profile.createdAt).split(',')[0]}</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Secciones del perfil">
        {([
          ['personal', 'Datos personales'],
          ['wallet', 'Wallet y preferencias'],
          ['security', 'Seguridad'],
        ] as const).map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'personal' && <PersonalForm profile={profile} onSaved={onSaved} />}
      {tab === 'wallet' && <WalletForm profile={profile} onSaved={onSaved} />}
      {tab === 'security' && (
        <SecuritySection
          onDeleted={async () => {
            await logout()
            navigate('/', { replace: true })
          }}
        />
      )}
    </div>
  )
}

function useSave() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    setDone(false)
    try {
      await fn()
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }
  return { saving, error, done, run, setError }
}

function PersonalForm({ profile, onSaved }: { profile: DonorProfile; onSaved: (p: DonorProfile) => Promise<void> }) {
  const [firstNames, setFirstNames] = useState(profile.firstNames)
  const [lastNames, setLastNames] = useState(profile.lastNames)
  const [gender, setGender] = useState<string>(profile.gender)
  const { saving, error, done, run, setError } = useSave()
  const docLabel = DOCUMENT_TYPES.find((d) => d.value === profile.documentType)?.label ?? profile.documentType

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (firstNames.trim().length < 2 || lastNames.trim().length < 2) return setError('Escribe tus nombres y apellidos.')
    run(async () => onSaved(await api.updateMyDonorProfile({ firstNames: firstNames.trim(), lastNames: lastNames.trim(), gender: gender as Gender })))
  }

  return (
    <form onSubmit={submit} className="card card-lg form" noValidate>
      <div className="form-grid">
        <TextField label="Nombres" icon={UserRound} value={firstNames} onChange={(e) => setFirstNames(e.target.value)} autoComplete="given-name" />
        <TextField label="Apellidos" icon={User} value={lastNames} onChange={(e) => setLastNames(e.target.value)} autoComplete="family-name" />
      </div>
      <SelectField label="Género" icon={Users} options={GENDERS} value={gender} onChange={(e) => setGender(e.target.value)} />
      <div className="form-grid">
        <TextField label="Documento" icon={IdCard} value={`${docLabel} · ${profile.documentNumber}`} readOnly disabled hint="Para cambiar tu documento escríbenos a soporte." />
        <TextField label="Correo electrónico" icon={Mail} value={profile.email} readOnly disabled />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Tus datos se guardaron.</Alert>}
      <div className="row"><button type="submit" className="btn btn-primary btn-lg" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  )
}

function WalletForm({ profile, onSaved }: { profile: DonorProfile; onSaved: (p: DonorProfile) => Promise<void> }) {
  const [wallet, setWallet] = useState(profile.walletAddress ?? '')
  const [publicName, setPublicName] = useState(profile.publicName ?? '')
  const [country, setCountry] = useState(profile.country)
  const [currency, setCurrency] = useState(profile.preferredCurrency ?? '')
  const [anonymous, setAnonymous] = useState(profile.isAnonymous)
  const { saving, error, done, run, setError } = useSave()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (wallet.trim() && !isValidWallet(wallet)) return setError('La wallet address no es válida, por ejemplo $ilp.interledger-test.dev/tu-nombre.')
    run(async () =>
      onSaved(
        await api.updateMyDonorProfile({
          walletAddress: wallet.trim(),
          publicName: publicName.trim() || null,
          country,
          preferredCurrency: currency || null,
          isAnonymous: anonymous,
        }),
      ),
    )
  }

  return (
    <form onSubmit={submit} className="card card-lg form" noValidate>
      <TextField
        label="Wallet address"
        icon={Wallet}
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        className="mono"
        placeholder="$ilp.interledger-test.dev/tu-nombre"
        spellCheck={false}
        hint="Necesaria para donar. Solo la dirección pública: nunca te pediremos llaves ni contraseñas de tu wallet."
      />
      <div className="form-grid">
        <SelectField label="País" icon={Globe} options={COUNTRIES} value={country} onChange={(e) => setCountry(e.target.value)} />
        <div className="field">
          <label className="label" htmlFor="pref-currency">Moneda preferida</label>
          <select id="pref-currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">Sin preferencia</option>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <TextField label="Nombre público (opcional)" value={publicName} onChange={(e) => setPublicName(e.target.value)} hint="Así te verán las fundaciones. Si lo dejas vacío, usamos tu nombre." />
      <label className="checkbox">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span><span className="strong">Donar de forma anónima</span><br /><span className="muted small">Las fundaciones no verán tu nombre en tus donaciones.</span></span>
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Preferencias guardadas.</Alert>}
      <div className="row"><button type="submit" className="btn btn-primary btn-lg" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form>
  )
}

function SecuritySection({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const pass = useSave()

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const del = useSave()

  const changePassword = (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return pass.setError('La nueva contraseña debe tener al menos 8 caracteres.')
    if (next !== confirm) return pass.setError('Las contraseñas no coinciden.')
    pass.run(async () => {
      await api.changeMyPassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
    })
  }

  const deleteAccount = (e: FormEvent) => {
    e.preventDefault()
    if (!deletePassword) return del.setError('Confirma con tu contraseña.')
    del.run(async () => {
      await api.deleteMyDonorAccount(deletePassword)
      await onDeleted()
    })
  }

  return (
    <div className="stack-md">
      <form onSubmit={changePassword} className="card card-lg form" noValidate>
        <h2 className="section-title"><Lock aria-hidden />Cambiar contraseña</h2>
        <PasswordField label="Contraseña actual" icon={Lock} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <div className="form-grid">
          <PasswordField label="Nueva contraseña" icon={Lock} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="Mínimo 8 caracteres." />
          <PasswordField label="Confirmar nueva contraseña" icon={Lock} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {pass.error && <Alert tone="error">{pass.error}</Alert>}
        {pass.done && <Alert tone="success">Tu contraseña se actualizó.</Alert>}
        <div className="row"><button type="submit" className="btn btn-primary" disabled={pass.saving}>{pass.saving ? 'Guardando…' : 'Actualizar contraseña'}</button></div>
      </form>

      <section className="card card-lg form danger-zone">
        <h2 className="section-title" style={{ color: 'var(--danger)' }}><Trash2 aria-hidden style={{ color: 'var(--danger)' }} />Eliminar cuenta</h2>
        <p className="muted">Se borran tu cuenta y tus datos personales. Esta acción no se puede deshacer.</p>
        {!confirmDelete ? (
          <div className="row"><button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Quiero eliminar mi cuenta</button></div>
        ) : (
          <form onSubmit={deleteAccount} className="form" noValidate>
            <PasswordField label="Confirma con tu contraseña" icon={Lock} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
            {del.error && <Alert tone="error">{del.error}</Alert>}
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button type="submit" className="btn btn-danger" disabled={del.saving}>{del.saving ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
