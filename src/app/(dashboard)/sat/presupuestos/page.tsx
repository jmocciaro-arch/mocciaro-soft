'use client'

/**
 * SAT > Presupuestos — placeholder.
 * Flujo StelOrder: presupuesto SAT (separado del de Ventas) que se convierte
 * en Pedido de trabajo (/sat/hojas) y luego Albarán de trabajo (/sat/albaranes).
 *
 * Implementación futura: tabla similar a /cotizador filtrada por contexto SAT.
 */

import Link from 'next/link'
import { FileText, ArrowRight } from 'lucide-react'

export default function Page() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-md bg-[#FFF5EE] flex items-center justify-center">
          <FileText size={20} className="text-[#FF6600]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1F2937]">Presupuestos SAT</h1>
      </div>
      <p className="text-[#6B7280] mb-6">
        Próximamente — flujo de presupuestos del servicio técnico, separado del flujo
        de Ventas.
      </p>
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 text-sm text-[#374151]">
        <p className="font-semibold text-[#1F2937] mb-2">Flujo previsto:</p>
        <div className="flex items-center gap-2 text-xs text-[#6B7280] flex-wrap">
          <span className="px-2 py-1 rounded bg-[#FFF5EE] text-[#FF6600] font-semibold">Presupuesto SAT</span>
          <ArrowRight size={14} />
          <span className="px-2 py-1 rounded bg-[#F5F5F5]">Pedido de trabajo</span>
          <ArrowRight size={14} />
          <span className="px-2 py-1 rounded bg-[#F5F5F5]">Albarán de trabajo</span>
          <ArrowRight size={14} />
          <span className="px-2 py-1 rounded bg-[#F5F5F5]">Factura</span>
        </div>
        <p className="mt-4 text-xs">
          Mientras tanto, podés usar el cotizador general:{' '}
          <Link href="/cotizador" className="text-[#FF6600] font-semibold hover:underline">
            ir a Presupuestos
          </Link>.
        </p>
      </div>
    </div>
  )
}
