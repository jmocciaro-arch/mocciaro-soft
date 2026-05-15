'use client'

/**
 * SAT > Albaranes de trabajo — placeholder.
 * Genera el albarán al cerrar una hoja/pedido de trabajo del SAT.
 */

import Link from 'next/link'
import { Truck } from 'lucide-react'

export default function Page() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-md bg-[#FFF5EE] flex items-center justify-center">
          <Truck size={20} className="text-[#FF6600]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1F2937]">Albaranes de trabajo</h1>
      </div>
      <p className="text-[#6B7280] mb-6">
        Próximamente — albaranes generados desde el cierre de un pedido de trabajo SAT,
        listos para facturar.
      </p>
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 text-sm text-[#374151]">
        Mientras tanto, los pedidos de trabajo se administran desde{' '}
        <Link href="/sat/hojas" className="text-[#FF6600] font-semibold hover:underline">
          Pedidos de trabajo
        </Link>.
      </div>
    </div>
  )
}
