'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Edit3, Check, X, ExternalLink, User, Calendar, Building2 } from 'lucide-react'
import { DocLink } from '@/components/ui/doc-link'

interface Document {
  id: string
  type: string
  system_code: string
  display_ref: string
  status: string
  currency: string
  total: number
  subtotal: number
  tax_amount: number
  delivery_date?: string
  incoterm?: string
  payment_terms?: string
  created_at: string
}

interface Client {
  id: string
  name: string
  tax_id?: string
  country?: string
}

interface Company {
  id: string
  name: string
  country?: string
}

interface ParentDoc {
  type: string
  ref: string
  id: string
}

interface DocumentHeaderProps {
  document: Document
  client?: Client
  company?: Company
  assignedTo?: string
  parentDocs?: ParentDoc[]
  onRefChange?: (newRef: string) => void
}

const typeColors: Record<string, string> = {
  lead: '#6B7280',
  coti: '#3B82F6',
  oc_cliente: '#8B5CF6',
  pedido: '#FF6600',
  pap: '#F59E0B',
  recepcion: '#14B8A6',
  delivery_note: '#00C853',
  factura: '#EC4899',
  cobro: '#10B981',
}

const typeLabels: Record<string, string> = {
  lead: 'Lead',
  coti: 'Cotizacion',
  oc_cliente: 'OC Cliente',
  pedido: 'Pedido',
  pap: 'Pedido a proveedor',
  recepcion: 'Recepcion',
  delivery_note: 'Albaran',
  factura: 'Factura',
  cobro: 'Cobro',
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(107,114,128,0.2)', text: '#6B7280' },
  confirmed: { bg: 'rgba(66,133,244,0.2)', text: '#4285F4' },
  in_process: { bg: 'rgba(255,102,0,0.2)', text: '#FF6600' },
  partial: { bg: 'rgba(255,179,0,0.2)', text: '#FFB300' },
  completed: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  cancelled: { bg: 'rgba(255,61,0,0.2)', text: '#FF3D00' },
  invoiced: { bg: 'rgba(236,72,153,0.2)', text: '#EC4899' },
}

export function DocumentHeader({
  document,
  client,
  company,
  assignedTo,
  parentDocs,
  onRefChange,
}: DocumentHeaderProps) {
  const [editingRef, setEditingRef] = useState(false)
  const [refValue, setRefValue] = useState(document.display_ref)

  const handleSaveRef = () => {
    onRefChange?.(refValue)
    setEditingRef(false)
  }

  const handleCancelRef = () => {
    setRefValue(document.display_ref)
    setEditingRef(false)
  }

  const typeColor = typeColors[document.type] || '#6B7280'
  const statusStyle = statusColors[document.status] || statusColors.draft

  return (
    <div className="bg-[#141820] rounded-xl border border-[#2A3040] p-5">
      {/* Top row: type badge + code + status */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type badge */}
          <span
            className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
            style={{ background: typeColor, color: '#fff' }}
          >
            {typeLabels[document.type] || document.type}
          </span>

          {/* System code */}
          <code className="text-sm font-mono text-[#9CA3AF] bg-[#0B0E13] px-2.5 py-1 rounded-md border border-[#2A3040]">
            {document.system_code}
          </code>

          {/* Editable reference */}
          <div className="flex items-center gap-1.5">
            {editingRef ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={refValue}
                  onChange={(e) => setRefValue(e.target.value)}
                  className="bg-[#0B0E13] border border-[#FF6600] rounded-md px-2 py-1 text-sm text-[#F0F2F5] focus:outline-none w-[200px]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRef()
                    if (e.key === 'Escape') handleCancelRef()
                  }}
                />
                <button
                  onClick={handleSaveRef}
                  className="p-1 rounded hover:bg-[#00C853]/20 text-[#00C853]"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={handleCancelRef}
                  className="p-1 rounded hover:bg-[#FF3D00]/20 text-[#FF3D00]"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingRef(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-[#F0F2F5] hover:text-[#FF6600] transition-colors group"
              >
                {document.display_ref}
                <Edit3
                  size={12}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            )}
          </div>
        </div>

        {/* Status badge */}
        <span
          className="px-3 py-1 rounded-full text-xs font-bold shrink-0"
          style={{ background: statusStyle.bg, color: statusStyle.text }}
        >
          {document.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* Client + company info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {client && (
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-[#6B7280] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F0F2F5] truncate">
                {client.name}
              </p>
              {client.tax_id && (
                <p className="text-[10px] text-[#6B7280]">
                  {client.country === 'AR' ? 'CUIT' : 'CIF'}: {client.tax_id}
                </p>
              )}
            </div>
          </div>
        )}

        {company && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#FF6600] flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold">TT</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[#9CA3AF] truncate">{company.name}</p>
              {company.country && (
                <p className="text-[10px] text-[#6B7280]">{company.country}</p>
              )}
            </div>
          </div>
        )}

        {assignedTo && (
          <div className="flex items-center gap-2">
            <User size={14} className="text-[#6B7280] shrink-0" />
            <p className="text-sm text-[#9CA3AF]">{assignedTo}</p>
          </div>
        )}
      </div>

      {/* Financial summary + meta */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-[#2A3040]">
        <div className="flex items-center gap-5 text-xs">
          <div>
            <span className="text-[#6B7280]">Subtotal: </span>
            <span className="text-[#F0F2F5] font-semibold">
              {document.currency} {document.subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[#6B7280]">IVA: </span>
            <span className="text-[#F0F2F5]">
              {document.currency} {document.tax_amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[#6B7280]">Total: </span>
            <span className="text-[#FF6600] font-bold text-sm">
              {document.currency} {document.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Quick links to parent docs */}
        {parentDocs && parentDocs.length > 0 && (
          <div className="flex items-center gap-2">
            {parentDocs.map((pdoc) => (
              <span
                key={pdoc.id}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#1C2230] border border-[#2A3040] text-[10px] text-[#9CA3AF]"
              >
                <ExternalLink size={10} />
                Ver {typeLabels[pdoc.type] || pdoc.type}:{' '}
                <DocLink docRef={pdoc.ref} docId={pdoc.id} docType={pdoc.type} className="text-[10px]" />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dates row */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[#6B7280]">
        <div className="flex items-center gap-1">
          <Calendar size={10} />
          Creado: {new Date(document.created_at).toLocaleDateString('es-ES')}
        </div>
        {document.delivery_date && (
          <div>Entrega: {new Date(document.delivery_date).toLocaleDateString('es-ES')}</div>
        )}
        {document.incoterm && <div>Incoterm: {document.incoterm}</div>}
        {document.payment_terms && <div>Pago: {document.payment_terms}</div>}
      </div>
    </div>
  )
}
