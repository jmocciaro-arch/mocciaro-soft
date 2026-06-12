'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { documentToTableRow } from '@/lib/document-helpers'
import { Plus } from 'lucide-react'

type Row = Record<string, unknown>

export function RecepcionesTab() {
  const supabase = createClient()
  const router = useRouter()
  const { addToast } = useToast()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      // Solo tt_documents — tt_purchase_orders es VIEW vacía tras Fase 2.
      const { data: docData } = await supabase
        .from('tt_documents')
        .select('*, client:tt_clients(id, name, legal_name)')
        .eq('doc_type', 'recepcion')
        .order('created_at', { ascending: false })
        .range(0, 499)

      const docRows = (docData || []).map((d: Row) => {
        const r = documentToTableRow(d)
        r.proveedor = r.cliente
        return r
      })
      setRows(docRows)
      setLoading(false)
    })()
  }, [supabase])

  const REC_COLS: DataTableColumn[] = [
    { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
    { key: 'proveedor', label: 'Proveedor', sortable: true, searchable: true },
    { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
    { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
    { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => addToast({ type: 'info', title: 'Crear desde Pedidos', message: 'Las recepciones se generan desde un Pedido a Proveedor (tab Pedidos).' })}
        >
          <Plus size={14} /> Nueva recepción
        </Button>
      </div>
      <DataTable
        data={rows}
        columns={REC_COLS}
        loading={loading}
        totalLabel="recepciones"
        showTotals
        exportFilename="recepciones_torquetools"
        pageSize={25}
        onRowClick={(row) => {
          const raw = row._raw as Row | undefined
          const id = (raw?.id as string) || (row.id as string)
          if (id) router.push(`/documentos/${id}`)
        }}
      />
    </div>
  )
}
