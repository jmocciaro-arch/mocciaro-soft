'use client'

/**
 * Clientes > Buscador web — alias de /buscador-clientes.
 * Mantiene la URL /clientes/buscador-web para que matchee la sección
 * "Clientes" del top nav.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  useEffect(() => { router.replace('/buscador-clientes') }, [router])
  return <div className="p-8 text-sm text-[#6B7280]">Abriendo buscador web…</div>
}
