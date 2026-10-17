import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // En desarrollo, /api va al backend desplegado (mismo origen → sin CORS).
  // Para un backend local: DONATIONS_PROXY_TARGET=http://localhost:3000 en .env.local
  const target = env.DONATIONS_PROXY_TARGET || 'https://deploy.szapatar.dev'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true, secure: true },
      },
    },
  }
})
