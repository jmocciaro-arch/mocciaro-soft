'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * /ventas/importar-oc — DEPRECATED
 *
 * El flujo de subir OC del cliente se movió al Cotizador (botón "Importar OC"
 * arriba a la derecha). Esta ruta queda como redirect para no romper accesos
 * antiguos (links guardados, bookmarks, mails con esta URL, etc.).
 *
 * Borrar la ruta entera en un sprint futuro cuando esté validado que nadie
 * la usa más (ver tabla de uso en /admin/observability si existe).
 */
export default function ImportarOCRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/cotizador')
  }, [router])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-[#9CA3AF]">
      <Loader2 size={28} className="animate-spin text-[#FF6600]" />
      <p className="text-sm">
        Esta página se movió al <strong className="text-[#F0F2F5]">Cotizador</strong>.
      </p>
      <p className="text-xs text-[#6B7280]">Redirigiendo…</p>
    </div>
  )
}
