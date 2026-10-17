/**
 * Punto único de acceso a datos para toda la app.
 *
 * - Con VITE_API_URL definida → httpApi (backend real, rama `backend`).
 * - Sin ella → mockApi (modo demo: datos solo en este navegador).
 *
 * Las dos implementaciones exponen las mismas funciones; las páginas no saben cuál usan.
 */
import { httpApi } from './httpApi'
import { mockApi } from './mockApi'

export const isDemoMode = !import.meta.env.VITE_API_URL

export const api = isDemoMode ? mockApi : httpApi

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'MXN', 'COP'] as const
