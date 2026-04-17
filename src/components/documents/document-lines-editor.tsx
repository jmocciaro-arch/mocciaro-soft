'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { deleteLine, type DocumentDetail, type DocumentLineRow } from '@/lib/documents/client'
import { LineFormModal } from './line-form-modal'

interface Props {
  detail: DocumentDetail
  onChanged: () => void          // refetch de detalle
}

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 2 })
      .format(Number(n) || 0)
  } catch {
    return `${currency} ${Number(n || 0).toFixed(2)}`
  }
}

export function DocumentLinesEditor({ detail, onChanged }: Props) {
  const { addToast } = useToast()
  const { document: doc, lines } = detail

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentLineRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const locked = doc.locked || doc.status !== 'draft'
  const currency = doc.currency_code || 'ARS'

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (line: DocumentLineRow) => { setEditing(line); setModalOpen(true) }

  const handleDelete = async (line: DocumentLineRow) => {
    if (locked) return
    if (!confirm(`¿Eliminar línea ${line.line_number} — ${line.product_name}?`)) return
    setBusyId(line.id)
    try {
      await deleteLine(doc.id, line.id)
      addToast({ type: 'success', title: 'Línea eliminada' })
      onChanged()
    } catch (e) {
      addToast({ type: 'error', title: 'Error eliminando', message: e instanceof Error ? e.message : '' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#F0F2F5]">Líneas</h3>
          <span className="text-xs text-[#6B7280]">({lines.length})</span>
          {locked && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]">
              <Lock className="h-3 w-3" /> bloqueadas
            </span>
          )}
        </div>
        {!locked && (
          <Button variant="primary" size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Agregar línea
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-[#1E2330] bg-[#0F1218] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#141820] text-[10px] uppercase tracking-wider text-[#6B7280]">
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-right w-24">Cant.</th>
                <th className="px-3 py-2 text-right w-32">P. unit.</th>
                <th className="px-3 py-2 text-right w-20">Desc %</th>
                <th className="px-3 py-2 text-right w-20">IVA %</th>
                <th className="px-3 py-2 text-right w-32">Subtotal</th>
                <th className="px-3 py-2 text-right w-32">Total</th>
                {!locked && <th className="px-3 py-2 w-24"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2330]">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={locked ? 8 : 9} className="py-10 text-center text-[#6B7280] text-sm">
                    No hay líneas todavía.
                    {!locked && (
                      <div className="mt-2">
                        <Button variant="secondary" size="sm" onClick={openAdd}>
                          <Plus className="h-4 w-4" />
                          Agregar la primera
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.id} className="hover:bg-[#141820] transition-colors">
                    <td className="px-3 py-2 text-[#9CA3AF] text-xs">{l.line_number}</td>
                    <td className="px-3 py-2">
                      <div className="text-[#F0F2F5] text-sm font-medium">{l.product_name}</div>
                      {(l.product_sku || l.description) && (
                        <div className="text-[#6B7280] text-xs mt-0.5">
                          {l.product_sku && <span className="font-mono mr-2">SKU: {l.product_sku}</span>}
                          {l.description && <span>{l.description}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[#F0F2F5] text-sm font-mono">
                      {Number(l.quantity)} <span className="text-[#6B7280] text-xs ml-1">{l.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-[#F0F2F5] text-sm font-mono">
                      {fmt(Number(l.unit_price), currency)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#9CA3AF] text-xs font-mono">
                      {Number(l.discount_pct) > 0 ? `${l.discount_pct}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-[#9CA3AF] text-xs font-mono">
                      {Number(l.tax_rate) > 0 ? `${l.tax_rate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-[#F0F2F5] text-sm font-mono">
                      {fmt(Number(l.subtotal), currency)}
                    </td>
                    <td className="px-3 py-2 text-right text-orange-400 text-sm font-mono font-semibold">
                      {fmt(Number(l.total), currency)}
                    </td>
                    {!locked && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(l)}
                            disabled={busyId === l.id}
                            className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors disabled:opacity-40"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(l)}
                            disabled={busyId === l.id}
                            className="p-1.5 rounded text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr className="bg-[#141820] border-t-2 border-[#2A3040]">
                  <td colSpan={6} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-[#6B7280]">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right text-[#F0F2F5] text-sm font-mono">
                    {fmt(Number(doc.subtotal), currency)}
                  </td>
                  <td colSpan={locked ? 1 : 2} />
                </tr>
                {Number(doc.discount_total) > 0 && (
                  <tr className="bg-[#141820]">
                    <td colSpan={6} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-[#6B7280]">
                      Descuentos
                    </td>
                    <td className="px-3 py-2 text-right text-[#9CA3AF] text-sm font-mono">
                      -{fmt(Number(doc.discount_total), currency)}
                    </td>
                    <td colSpan={locked ? 1 : 2} />
                  </tr>
                )}
                <tr className="bg-[#141820]">
                  <td colSpan={6} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-[#6B7280]">
                    Impuestos
                  </td>
                  <td className="px-3 py-2 text-right text-[#F0F2F5] text-sm font-mono">
                    {fmt(Number(doc.tax_total), currency)}
                  </td>
                  <td colSpan={locked ? 1 : 2} />
                </tr>
                <tr className="bg-[#0F1218] border-t border-[#2A3040]">
                  <td colSpan={6} className="px-3 py-3 text-right text-xs uppercase tracking-wider text-[#F0F2F5] font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right text-orange-400 text-base font-mono font-bold">
                    {fmt(Number(doc.total), currency)}
                  </td>
                  <td colSpan={locked ? 1 : 2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <LineFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        documentId={doc.id}
        line={editing}
        onSuccess={() => { setModalOpen(false); setEditing(null); onChanged() }}
      />
    </>
  )
}
