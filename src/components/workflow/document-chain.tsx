'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { DocLink } from '@/components/ui/doc-link'
import { ChevronDown, ChevronUp, GitMerge, Loader2 } from 'lucide-react'

// ===============================================================
// TYPES
// ===============================================================

interface ChainNode {
  id: string
  type: string
  display_ref: string
  system_code: string
  status: string
  created_at: string
  depth: number
  is_current: boolean
}

interface DocumentChainProps {
  documentId: string
  className?: string
}

// ── Config por tipo ────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  coti: 'Cotización',
  pedido: 'Pedido',
  delivery_note: 'Albarán',
  factura: 'Factura',
  pap: 'Ped. Proveedor',
  recepcion: 'Recepción',
  factura_compra: 'Fact. Compra',
  orden_compra: 'OC Cliente',
  oc_cliente: 'OC Cliente',
}

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default' | 'info' | 'orange'; label: string }> = {
  // Cotización
  draft:              { variant: 'default',  label: 'Borrador' },
  sent:               { variant: 'info',     label: 'Enviada' },
  accepted:           { variant: 'success',  label: 'Aceptada' },
  rejected:           { variant: 'danger',   label: 'Rechazada' },
  closed:             { variant: 'default',  label: 'Cerrada' },
  // Pedido
  open:               { variant: 'orange',   label: 'Abierto' },
  partially_delivered:{ variant: 'warning',  label: 'Entrega parcial' },
  fully_delivered:    { variant: 'success',  label: 'Entregado' },
  partially_invoiced: { variant: 'warning',  label: 'Fact. parcial' },
  fully_invoiced:     { variant: 'success',  label: 'Facturado' },
  // Albarán
  pending:            { variant: 'warning',  label: 'Pendiente' },
  delivered:          { variant: 'success',  label: 'Entregado' },
  // Factura
  paid:               { variant: 'success',  label: 'Pagada' },
  partial:            { variant: 'warning',  label: 'Pago parcial' },
  // Genéricos
  validated:          { variant: 'success',  label: 'Validada' },
  pending_validation: { variant: 'warning',  label: 'Pend. validación' },
  emitida:            { variant: 'orange',   label: 'Emitida' },
}

function getStatusBadge(status: string) {
  return STATUS_BADGE[status] || { variant: 'default' as const, label: status }
}

// ── Orden jerárquico de tipos ──────────────────────────────────
const TYPE_ORDER: Record<string, number> = {
  coti: 0,
  orden_compra: 1,
  oc_cliente: 1,
  pedido: 2,
  delivery_note: 3,
  factura: 4,
  pap: 5,
  recepcion: 6,
  factura_compra: 7,
}

// ===============================================================
// COMPONENT
// ===============================================================

export function DocumentChain({ documentId, className }: DocumentChainProps) {
  const supabase = createClient()
  const [chain, setChain] = useState<ChainNode[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  const buildChain = useCallback(async () => {
    setLoading(true)
    try {
      // Obtener el doc actual
      const { data: currentDoc } = await supabase
        .from('tt_documents')
        .select('id, doc_type, display_ref, system_code, status, created_at')
        .eq('id', documentId)
        .maybeSingle()

      if (!currentDoc) {
        setChain([])
        return
      }

      // Rastrear hacia arriba (parents)
      const visited = new Set<string>()
      const allNodes: ChainNode[] = []

      async function walkUp(docId: string, depth: number) {
        if (visited.has(docId) || depth > 10) return
        visited.add(docId)

        const { data: links } = await supabase
          .from('tt_document_relations')
          .select('parent_id, parent:tt_documents!parent_id(id, doc_type, display_ref, system_code, status, created_at)')
          .eq('child_id', docId)

        for (const link of links || []) {
          const parent = (link.parent as unknown) as {
            id: string; doc_type: string; display_ref: string
            system_code: string; status: string; created_at: string
          } | null
          if (parent?.id) {
            allNodes.push({
              id: parent.id,
              type: parent.doc_type || '',
              display_ref: parent.display_ref || parent.system_code || parent.id,
              system_code: parent.system_code || '',
              status: parent.status || '',
              created_at: parent.created_at || '',
              depth: -(depth + 1),
              is_current: false,
            })
            await walkUp(parent.id, depth + 1)
          }
        }
      }

      async function walkDown(docId: string, depth: number) {
        if (visited.has(docId) || depth > 10) return
        visited.add(docId)

        const { data: links } = await supabase
          .from('tt_document_relations')
          .select('child_id, child:tt_documents!child_id(id, doc_type, display_ref, system_code, status, created_at)')
          .eq('parent_id', docId)

        for (const link of links || []) {
          const child = (link.child as unknown) as {
            id: string; doc_type: string; display_ref: string
            system_code: string; status: string; created_at: string
          } | null
          if (child?.id) {
            allNodes.push({
              id: child.id,
              type: child.doc_type || '',
              display_ref: child.display_ref || child.system_code || child.id,
              system_code: child.system_code || '',
              status: child.status || '',
              created_at: child.created_at || '',
              depth: depth + 1,
              is_current: false,
            })
            await walkDown(child.id, depth + 1)
          }
        }
      }

      // Caminar hacia arriba y hacia abajo
      await walkUp(documentId, 0)
      await walkDown(documentId, 0)

      // Agregar nodo actual
      allNodes.push({
        id: currentDoc.id,
        type: (currentDoc.doc_type as string) || '',
        display_ref: (currentDoc.display_ref as string) || (currentDoc.system_code as string) || currentDoc.id,
        system_code: (currentDoc.system_code as string) || '',
        status: (currentDoc.status as string) || '',
        created_at: (currentDoc.created_at as string) || '',
        depth: 0,
        is_current: true,
      })

      // Ordenar: por TYPE_ORDER del tipo, luego por fecha
      const sorted = allNodes.sort((a, b) => {
        const orderA = TYPE_ORDER[a.type] ?? 99
        const orderB = TYPE_ORDER[b.type] ?? 99
        if (orderA !== orderB) return orderA - orderB
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      setChain(sorted)
    } finally {
      setLoading(false)
    }
  }, [documentId, supabase])

  useEffect(() => {
    buildChain()
  }, [buildChain])

  // No mostrar nada si solo hay 1 nodo (el actual) o está vacío
  if (!loading && chain.length <= 1) return null

  return (
    <div className={`border border-[#2A3040] rounded-lg overflow-hidden print:hidden ${className || ''}`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-[#141820] hover:bg-[#1C2230] transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-[#9CA3AF]">
          <GitMerge size={13} className="text-[#FF6600]" />
          Trazabilidad del documento
          {chain.length > 0 && (
            <span className="text-[#4B5563]">({chain.length} docs)</span>
          )}
        </span>
        {loading ? (
          <Loader2 size={13} className="text-[#6B7280] animate-spin" />
        ) : collapsed ? (
          <ChevronDown size={13} className="text-[#6B7280]" />
        ) : (
          <ChevronUp size={13} className="text-[#6B7280]" />
        )}
      </button>

      {/* Chain */}
      {!collapsed && !loading && chain.length > 0 && (
        <div className="px-4 py-3 space-y-0">
          {chain.map((node, idx) => {
            const badge = getStatusBadge(node.status)
            const isLast = idx === chain.length - 1

            return (
              <div key={node.id} className="flex items-start gap-3">
                {/* Line connector */}
                <div className="flex flex-col items-center shrink-0 w-4">
                  <div
                    className={`w-2.5 h-2.5 rounded-full border-2 mt-1 shrink-0 ${
                      node.is_current
                        ? 'bg-[#FF6600] border-[#FF6600]'
                        : 'bg-[#1C2230] border-[#2A3040]'
                    }`}
                  />
                  {!isLast && (
                    <div className="w-px flex-1 bg-[#2A3040] mt-0.5 mb-0.5 min-h-[16px]" />
                  )}
                </div>

                {/* Content */}
                <div className={`flex items-center justify-between gap-2 flex-1 pb-2 ${isLast ? '' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-[#4B5563] shrink-0">
                      {TYPE_LABELS[node.type] || node.type}
                    </span>
                    {node.is_current ? (
                      <span className="text-xs font-semibold text-[#FF6600]">
                        {node.display_ref}
                      </span>
                    ) : (
                      <DocLink
                        docRef={node.display_ref}
                        docId={node.id}
                        docType={node.type}
                        className="text-xs"
                      />
                    )}
                  </div>
                  <Badge variant={badge.variant} size="sm">
                    {badge.label}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-[#6B7280]" />
        </div>
      )}
    </div>
  )
}
