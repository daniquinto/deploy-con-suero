/**
 * Marca de Mano Abierta: una mano que sostiene un corazón.
 * Versión vectorial simplificada del logo; si el equipo tiene el archivo
 * original, puede reemplazarse por <img src="/logo.svg">.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 15c-3.5-6.5-16-7-16 4 0 8 8.5 13.5 16 19 7.5-5.5 16-11 16-19 0-11-12.5-10.5-16-4z"
        fill="var(--accent)"
        stroke="var(--primary)"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <path
        d="M6 58c0-11 7-18 17-18h15c3 0 3 5 0 5h-9 13c5 0 10-6 14-11 2-2.5 5.5 0 3.5 3-5 8-10 21-26 21z"
        fill="var(--primary)"
      />
      <path d="M29 45h12" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span>Mano Abierta</span>
    </span>
  )
}
