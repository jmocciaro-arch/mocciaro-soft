'use client'

/**
 * SAT layout — sin sub-nav propio.
 *
 * Antes este layout tenía una barra horizontal dark con Dashboard/Activos/Hojas/…
 * que duplicaba la sub-sidebar StelOrder. Ahora la sub-sidebar
 * ([shell/sub-sidebar.tsx](../../../components/shell/sub-sidebar.tsx)) muestra
 * los mismos items con el estilo correcto, así que el sub-nav horizontal
 * dejó de ser necesario.
 *
 * Si en el futuro hace falta volver a tener la barra horizontal, la versión
 * anterior vive en git (commit previo a esta migración).
 */

export default function SatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
