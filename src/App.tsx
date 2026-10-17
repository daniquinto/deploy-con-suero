import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { HandHeart } from 'lucide-react'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { AdminPage } from './pages/AdminPage'
import { AuthPage } from './pages/AuthPage'
import { CauseDetailPage } from './pages/CauseDetailPage'
import { CausesPage } from './pages/CausesPage'
import { CreateCausePage } from './pages/CreateCausePage'
import { DonatePage } from './pages/DonatePage'
import { DonationStatusPage } from './pages/DonationStatusPage'
import { DonorProfilePage } from './pages/DonorProfilePage'
import { GovernmentPage } from './pages/GovernmentPage'
import { LandingPage } from './pages/LandingPage'
import { MyCausesPage } from './pages/MyCausesPage'
import { MyDonationsPage } from './pages/MyDonationsPage'

/**
 * Donante:   Landing → Ingresar/Registrarme → Causas → Detalle → Donar → Mis donaciones · Mi perfil
 * Fundación: Ingresar/Registrarme → Mis causas → Crear causa
 * Vistas de demostración: /gobierno y /admin
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="ingresar" element={<AuthPage mode="login" />} />
        <Route path="registro" element={<AuthPage mode="register" />} />

        <Route path="causas" element={<CausesPage />} />
        <Route path="causas/:id" element={<CauseDetailPage />} />
        <Route path="causas/:id/donar" element={<RequireAuth role="donor"><DonatePage /></RequireAuth>} />
        {/* Retorno del callback de Open Payments: FRONTEND_URL/donacion/:id?status=… */}
        <Route path="donacion/:id" element={<DonationStatusPage />} />
        <Route path="mis-donaciones" element={<RequireAuth role="donor"><MyDonationsPage /></RequireAuth>} />
        <Route path="mi-perfil" element={<RequireAuth role="donor"><DonorProfilePage /></RequireAuth>} />

        <Route path="mi-fundacion" element={<RequireAuth role="foundation"><MyCausesPage /></RequireAuth>} />
        <Route path="mi-fundacion/causas/nueva" element={<RequireAuth role="foundation"><CreateCausePage /></RequireAuth>} />

        <Route path="gobierno" element={<GovernmentPage />} />
        <Route path="admin" element={<AdminPage />} />

        {/* Rutas anteriores, por si alguien guardó el enlace */}
        <Route path="fundaciones" element={<Navigate to="/causas" replace />} />

        <Route
          path="*"
          element={
            <EmptyState icon={HandHeart} title="Página no encontrada" action={<Link to="/" className="btn btn-primary">Volver al inicio</Link>}>
              El enlace puede estar mal escrito o la página ya no existe.
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  )
}
