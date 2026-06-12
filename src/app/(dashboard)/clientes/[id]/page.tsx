/**
 * Ruta /clientes/[id] — vista 360° del cliente
 *
 * Server component thin-wrapper: extrae el id de los params y delega a
 * <ClientDetailView /> que es client component (todo el fetch corre en el
 * navegador con el supabase client autenticado por cookies).
 */
import { Suspense } from 'react'
import { ClientDetailView } from '@/components/clients/client-detail-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[#9CA3AF]">Cargando…</div>}>
      <ClientDetailView clientId={id} />
    </Suspense>
  )
}
