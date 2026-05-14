'use client'

/**
 * Más > Workflows técnico — placeholder.
 *
 * Conceptualmente: vista avanzada/técnica de workflows (eventos, triggers,
 * código). La versión "Proyectos" friendly vive en /workflows.
 * Por ahora reusa el mismo módulo redirigiendo a /workflows.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  useEffect(() => { router.replace('/workflows') }, [router])
  return <div className="p-8 text-sm text-[#6B7280]">Abriendo workflows técnico…</div>
}
