import { useEffect, useState } from 'react'

/** Carga datos asíncronos y expone {data, error, loading}. Se recarga si cambian las deps. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .then((value) => !cancelled && (setData(value), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Error inesperado'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading }
}
