/**
 * Ruta /proveedores/[id] — vista 360° del proveedor
 */
import { Suspense } from 'react'
import { SupplierDetailView } from '@/components/suppliers/supplier-detail-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { id } = await params
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#9CA3AF]">Cargando…</div>}>
      <SupplierDetailView supplierId={id} />
    </Suspense>
  )
}
