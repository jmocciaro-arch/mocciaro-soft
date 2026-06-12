'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyFilter } from '@/hooks/use-company-filter'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { DocumentForm } from '@/components/workflow/document-form'
import { documentToTableRow } from '@/lib/document-helpers'

type Row = Record<string, unknown>

const FACTURA_COLS: DataTableColumn[] = [
  { key: 'referencia', label: 'Referencia', sortable: true, searchable: true, width: '140px' },
  { key: 'cliente', label: 'Cliente', sortable: true, searchable: true },
  { key: 'titulo', label: 'Titulo', searchable: true },
  { key: 'estado', label: 'Estado', sortable: true, type: 'status', width: '120px' },
  { key: 'fecha', label: 'Fecha', sortable: true, type: 'date', width: '110px' },
  { key: 'importe', label: 'Importe', sortable: true, type: 'currency', width: '120px' },
]

export function FacturasTab() {
  const { filterByCompany, companyKey } = useCompanyFilter()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; source: 'local' | 'tt_documents' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('tt_documents').select('*, client:tt_clients(id, name, legal_name, tax_id)').in('doc_type', ['factura', 'factura_abono'])
    q = filterByCompany(q)
    const { data: docData } = await q.order('created_at', { ascending: false }).range(0, 499)
    setRows((docData || []).map(documentToTableRow))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyKey])

  useEffect(() => { load() }, [load])

  const openDetail = (row: Record<string, unknown>) => {
    const doc = row._raw as Row
    const src = row._source as string
    setSelectedDoc({ id: doc.id as string, source: src === 'local' ? 'local' : 'tt_documents' })
  }

  if (selectedDoc) {
    const allIds = rows.map(r => (r._raw as Row).id as string)
    return (
      <DocumentForm
        documentId={selectedDoc.id}
        documentType="factura"
        source={selectedDoc.source}
        onBack={() => { setSelectedDoc(null); load() }}
        onUpdate={load}
        siblingIds={allIds}
      />
    )
  }

  return (
    <DataTable
      data={rows}
      columns={FACTURA_COLS}
      loading={loading}
      totalLabel="facturas"
      showTotals
      onRowClick={openDetail}
      exportFilename="facturas_venta_torquetools"
      pageSize={25}
    />
  )
}
