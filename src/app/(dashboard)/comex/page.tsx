'use client'

import { Suspense } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { Loader2, Truck, Box, Package } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { EmptyState } from '@/components/ui/empty-state'
import { PhysicalDataTab } from '@/components/comex/physical-data-tab'
import { PackingTab } from '@/components/comex/packing-tab'

const TABS = [
  { id: 'fisicos', label: 'Datos físicos', icon: <Package size={16} /> },
  { id: 'packing', label: 'Packing', icon: <Box size={16} /> },
]

export default function ComexPage() {
  const { can, loading } = usePermissions()

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>
  }
  if (!can('view_comex')) {
    return (
      <div className="p-6">
        <EmptyState icon={<Truck size={48} />} title="Sin acceso a Comex y Logística"
          description="Pedí a un admin el permiso view_comex." />
      </div>
    )
  }
  const canManage = can('manage_comex')

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6" /> Comex y Logística</h1>
        <p className="text-sm opacity-60">Datos físicos de productos, packing y (próximamente) tarifas de flete.</p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>}>
        <Tabs tabs={TABS} defaultTab="fisicos">
          {(tab) => (
            <div className="mt-4">
              {tab === 'fisicos' && <PhysicalDataTab canManage={canManage} />}
              {tab === 'packing' && <PackingTab canManage={canManage} />}
            </div>
          )}
        </Tabs>
      </Suspense>
    </div>
  )
}
