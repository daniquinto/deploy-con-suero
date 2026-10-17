import { useState } from 'react'
import { HandHeart, Search } from 'lucide-react'
import { CauseCard } from '../components/CauseCard'
import { EmptyState, Loading } from '../components/ui'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'

export function CausesPage() {
  const { data: causes, loading, error } = useAsync(() => api.listActiveCauses(), [])
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = (causes ?? []).filter((c) =>
    [c.title, c.foundationName, c.location].some((text) => text.toLowerCase().includes(q)),
  )

  return (
    <div className="stack-md">
      <div className="page-head">
        <div>
          <h1>Causas activas</h1>
          <p>Elige a quién ayudar. Todas son de fundaciones activas y cada aporte queda registrado.</p>
        </div>
        {causes && <span className="chip">{causes.length} causas</span>}
      </div>

      <label className="search">
        <span className="sr-only">Buscar causas</span>
        <Search aria-hidden />
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por causa, fundación o lugar" />
      </label>

      {loading && <Loading />}
      {error && <p className="error">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState icon={HandHeart} title={q ? 'Sin resultados' : 'Aún no hay causas activas'}>
          {q ? 'Prueba con otra palabra: el nombre de la fundación o la ciudad.' : 'Cuando una fundación publique una causa, aparecerá aquí.'}
        </EmptyState>
      )}

      <div className="grid">
        {visible.map((c) => <CauseCard key={c.id} cause={c} />)}
      </div>
    </div>
  )
}
