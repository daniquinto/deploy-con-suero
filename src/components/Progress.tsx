import { formatMoney } from '../lib/format'

interface Props {
  raised: number
  goal: number
  currency: string
  /** Muestra "de META" además del porcentaje. */
  showGoal?: boolean
}

export function Progress({ raised, goal, currency, showGoal }: Props) {
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0

  return (
    <div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la meta">
        <div style={{ width: `${Math.max(pct, raised > 0 ? 2 : 0)}%` }} />
      </div>
      <div className="progress-meta">
        <span className="strong num">{formatMoney({ amount: raised, currency })}</span>
        <span className="muted num">{showGoal ? `${pct}% de ${formatMoney({ amount: goal, currency })}` : `${pct}%`}</span>
      </div>
    </div>
  )
}
