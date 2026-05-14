'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { orderToDeliveryNote, precheckDeliveryStock, type DeliveryItem } from '@/lib/document-workflow'
import type { StockShortfall } from '@/lib/stock-ops'
import { getUserPermissions, hasPermission } from '@/lib/rbac'
import { StockShortfallModal, type StockShortfallDecision } from '@/components/workflow/stock-shortfall-modal'
import {
  Truck, Package, Check, ChevronDown, ChevronRight,
  Loader2, Minus, Plus, FileText, AlertCircle,
} from 'lucide-react'

type Row = Record<string, unknown>

interface OrderForDelivery {
  id: string
  doc_number: string
  display_ref: string
  source: 'local' | 'tt_documents'
  items: DeliveryItemLine[]
  expanded: boolean
  selected: boolean
}

interface DeliveryItemLine {
  id: string
  sku: string
  description: string
  ordered: number
  delivered: number
  pending: number
  toDeliver: number
  unit_price: number
  selected: boolean
  so_ref: string
}

interface GenerateDeliveryNoteModalProps {
  isOpen: boolean
  onClose: () => void
  /** Client ID to find all pending orders */
  clientId: string
  clientName: string
  /** Current order ID (pre-selected) */
  currentOrderId?: string
  currentOrderSource?: 'local' | 'tt_documents'
  onCreated: (result: { deliveryNoteId: string; deliveryNoteNumber: string }) => void
}

export function GenerateDeliveryNoteModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  currentOrderId,
  currentOrderSource,
  onCreated,
}: GenerateDeliveryNoteModalProps) {
  const { addToast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [orders, setOrders] = useState<OrderForDelivery[]>([])
  const [previewMode, setPreviewMode] = useState(false)

  // FASE 1.1 — Modal "stock insuficiente"
  const [shortfallModalOpen, setShortfallModalOpen] = useState(false)
  const [shortfallList, setShortfallList] = useState<StockShortfall[]>([])
  const [canOverdeliver, setCanOverdeliver] = useState(false)
  // Stash de la decisión pre-modal para re-disparar handleCreate con opciones
  const [pendingCreateContext, setPendingCreateContext] = useState<{
    allItems: DeliveryItem[]
    primaryOrderId: string
    primaryOrderSource: 'local' | 'tt_documents'
  } | null>(null)

  // Load all pending orders for this client
  const loadOrders = useCallback(async () => {
    if (!clientId || !isOpen) return
    setLoading(true)
    try {
      const loadedOrders: OrderForDelivery[] = []

      // Load local orders (tt_sales_orders)
      const { data: localOrders } = await supabase
        .from('tt_sales_orders')
        .select('id, doc_number, status, client_id')
        .eq('client_id', clientId)
        .in('status', ['open', 'partially_delivered', 'accepted'])
        .order('created_at', { ascending: false })

      for (const so of (localOrders || [])) {
        const { data: items } = await supabase
          .from('tt_so_items')
          .select('*')
          .eq('sales_order_id', so.id)
          .order('sort_order')

        const mappedItems: DeliveryItemLine[] = (items || []).map((it: Row) => {
          const ordered = (it.qty_ordered as number) || (it.quantity as number) || 0
          const delivered = (it.qty_delivered as number) || 0
          const pending = Math.max(0, ordered - delivered)
          return {
            id: it.id as string,
            sku: (it.sku as string) || '',
            description: (it.description as string) || '',
            ordered,
            delivered,
            pending,
            toDeliver: pending, // default: deliver all pending
            unit_price: (it.unit_price as number) || 0,
            selected: pending > 0,
            so_ref: so.doc_number || so.id,
          }
        }).filter((it: DeliveryItemLine) => it.pending > 0)

        if (mappedItems.length > 0) {
          loadedOrders.push({
            id: so.id,
            doc_number: so.doc_number || '-',
            display_ref: so.doc_number || '-',
            source: 'local',
            items: mappedItems,
            expanded: so.id === currentOrderId,
            selected: so.id === currentOrderId,
          })
        }
      }

      // Load tt_documents orders
      const { data: docOrders } = await supabase
        .from('tt_documents')
        .select('id, display_ref, system_code, status, client_id')
        .eq('client_id', clientId)
        .eq('doc_type', 'pedido')
        .in('status', ['open', 'partially_delivered', 'accepted'])
        .order('created_at', { ascending: false })

      for (const so of (docOrders || [])) {
        const { data: items } = await supabase
          .from('tt_document_lines')
          .select('*')
          .eq('document_id', so.id)
          .order('sort_order')

        const soRef = (so.display_ref as string) || (so.system_code as string) || '-'
        const mappedItems: DeliveryItemLine[] = (items || []).map((it: Row) => {
          const ordered = (it.quantity as number) || 0
          const delivered = (it.qty_delivered as number) || 0
          const pending = Math.max(0, ordered - delivered)
          return {
            id: it.id as string,
            sku: (it.sku as string) || '',
            description: (it.description as string) || '',
            ordered,
            delivered,
            pending,
            toDeliver: pending,
            unit_price: (it.unit_price as number) || 0,
            selected: pending > 0,
            so_ref: soRef,
          }
        }).filter((it: DeliveryItemLine) => it.pending > 0)

        if (mappedItems.length > 0) {
          loadedOrders.push({
            id: so.id,
            doc_number: soRef,
            display_ref: soRef,
            source: 'tt_documents',
            items: mappedItems,
            expanded: so.id === currentOrderId,
            selected: so.id === currentOrderId,
          })
        }
      }

      setOrders(loadedOrders)
    } catch (err) {
      addToast({ type: 'error', title: 'Error cargando pedidos', message: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }, [clientId, isOpen, currentOrderId, supabase, addToast])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Toggle order selection
  const toggleOrder = (orderId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      const newSelected = !o.selected
      return {
        ...o,
        selected: newSelected,
        expanded: newSelected ? true : o.expanded,
        items: o.items.map(it => ({ ...it, selected: newSelected, toDeliver: newSelected ? it.pending : 0 })),
      }
    }))
  }

  // Toggle order expansion
  const toggleExpanded = (orderId: string) => {
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, expanded: !o.expanded } : o
    ))
  }

  // Toggle item selection
  const toggleItem = (orderId: string, itemId: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      const updatedItems = o.items.map(it => {
        if (it.id !== itemId) return it
        const newSelected = !it.selected
        return { ...it, selected: newSelected, toDeliver: newSelected ? it.pending : 0 }
      })
      const anySelected = updatedItems.some(it => it.selected)
      return { ...o, items: updatedItems, selected: anySelected }
    }))
  }

  // Update quantity to deliver
  const updateToDeliver = (orderId: string, itemId: string, value: number) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      return {
        ...o,
        items: o.items.map(it => {
          if (it.id !== itemId) return it
          const clamped = Math.max(0, Math.min(value, it.pending))
          return { ...it, toDeliver: clamped, selected: clamped > 0 }
        }),
      }
    }))
  }

  // Get all selected items grouped by order
  const selectedOrders = orders.filter(o => o.selected && o.items.some(it => it.selected && it.toDeliver > 0))
  const totalItems = selectedOrders.reduce((sum, o) => sum + o.items.filter(it => it.selected && it.toDeliver > 0).length, 0)
  const totalUnits = selectedOrders.reduce((sum, o) =>
    sum + o.items.filter(it => it.selected).reduce((s, it) => s + it.toDeliver, 0), 0
  )

  // Create the delivery note (con pre-check de stock + overdelivery flow)
  const handleCreate = async () => {
    if (selectedOrders.length === 0) {
      addToast({ type: 'error', title: 'Selecciona al menos un item' })
      return
    }
    setCreating(true)
    try {
      // For multi-OC, we create a single delivery note with items from all orders
      // Use the first order as the base
      const primaryOrder = selectedOrders[0]
      const allDeliveryItems: DeliveryItem[] = []

      for (const order of selectedOrders) {
        for (const item of order.items) {
          if (item.selected && item.toDeliver > 0) {
            allDeliveryItems.push({
              id: item.id,
              description: `[${order.doc_number}] ${item.description}`,
              ordered: item.ordered,
              delivered: item.delivered,
              toDeliver: item.toDeliver,
            })
          }
        }
      }

      // FASE 1.1 — Pre-check stock físico
      const check = await precheckDeliveryStock(primaryOrder.id, allDeliveryItems)
      if (check.ok && check.shortfalls.length > 0) {
        // Verificar permiso allow_overdelivery
        const { data: authUser } = await supabase.auth.getUser()
        const userId = authUser?.user?.id
        let allow = false
        if (userId) {
          const perms = await getUserPermissions(userId)
          allow = hasPermission(perms, 'allow_overdelivery')
        }
        setCanOverdeliver(allow)
        setShortfallList(check.shortfalls)
        setPendingCreateContext({
          allItems: allDeliveryItems,
          primaryOrderId: primaryOrder.id,
          primaryOrderSource: primaryOrder.source,
        })
        setShortfallModalOpen(true)
        setCreating(false)
        return
      }

      // Sin shortfall → emisión directa
      const result = await orderToDeliveryNote(
        primaryOrder.id,
        allDeliveryItems,
        primaryOrder.source
      )

      // If multi-OC, also update delivered qty on other orders
      if (selectedOrders.length > 1) {
        for (const order of selectedOrders.slice(1)) {
          for (const item of order.items) {
            if (item.selected && item.toDeliver > 0) {
              if (order.source === 'local') {
                await supabase
                  .from('tt_so_items')
                  .update({ qty_delivered: item.delivered + item.toDeliver })
                  .eq('id', item.id)
              } else {
                await supabase
                  .from('tt_document_lines')
                  .update({ qty_delivered: item.delivered + item.toDeliver })
                  .eq('id', item.id)
              }
            }
          }
        }
      }

      addToast({
        type: 'success',
        title: 'Remito generado',
        message: `${result.deliveryNoteNumber} - ${totalItems} items de ${selectedOrders.length} pedido(s)`,
      })
      onCreated(result)
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando remito', message: (err as Error).message })
    } finally {
      setCreating(false)
    }
  }

  // FASE 1.1/1.5 — Resolver decisión del modal de stock insuficiente
  async function handleShortfallDecision(decision: StockShortfallDecision) {
    if (decision.action === 'cancel' || !pendingCreateContext) {
      setShortfallModalOpen(false)
      setPendingCreateContext(null)
      return
    }
    setCreating(true)
    try {
      const ctx = pendingCreateContext
      let itemsToUse = ctx.allItems

      if (decision.action === 'partial') {
        // Recortar cada item a la cantidad disponible
        const shortfallMap = new Map(shortfallList.map((s) => [s.product_id, s.on_hand]))
        // Mapear so_item_id → product_id usando los selectedOrders
        const productIdBySoItem = new Map<string, string>()
        for (const o of selectedOrders) {
          for (const it of o.items) {
            // No tenemos product_id en DeliveryItemLine — la query inicial no lo trajo.
            // El recorte parcial: si el shortfall por producto es X, restamos X del item.
            // Como no tenemos product_id acá, hacemos lookup vía SO items.
            const _ = it.id; void _
          }
        }
        // Plan B simple: traer product_id en una query rápida y recortar
        const itemIds = ctx.allItems.map((i) => i.id)
        const { data: soItems } = await supabase
          .from('tt_so_items')
          .select('id, product_id')
          .in('id', itemIds)
        for (const so of soItems || []) {
          productIdBySoItem.set(so.id as string, so.product_id as string)
        }
        itemsToUse = ctx.allItems.map((it) => {
          const pid = productIdBySoItem.get(it.id)
          if (!pid) return it
          const onHand = shortfallMap.get(pid)
          if (onHand === undefined) return it // no estaba en shortfall
          return { ...it, toDeliver: Math.min(it.toDeliver, onHand) }
        }).filter((it) => it.toDeliver > 0)

        if (itemsToUse.length === 0) {
          addToast({
            type: 'warning',
            title: 'Sin stock para emitir',
            message: 'Ningún producto tiene stock físico disponible.',
          })
          setShortfallModalOpen(false)
          setPendingCreateContext(null)
          setCreating(false)
          return
        }
      }

      const { data: authUser } = await supabase.auth.getUser()
      const userId = authUser?.user?.id ?? null

      const result = await orderToDeliveryNote(
        ctx.primaryOrderId,
        itemsToUse,
        ctx.primaryOrderSource,
        decision.action === 'overdeliver'
          ? { allowOverdelivery: true, overdeliveryReason: decision.reason, actorUserId: userId }
          : { actorUserId: userId }
      )

      addToast({
        type: 'success',
        title: 'Remito generado',
        message: `${result.deliveryNoteNumber}${decision.action === 'overdeliver' ? ' (con overdelivery)' : decision.action === 'partial' ? ' (parcial)' : ''}`,
      })
      setShortfallModalOpen(false)
      setPendingCreateContext(null)
      onCreated(result)
      onClose()
    } catch (err) {
      addToast({ type: 'error', title: 'Error generando remito', message: (err as Error).message })
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <StockShortfallModal
        isOpen={shortfallModalOpen}
        onClose={() => { setShortfallModalOpen(false); setPendingCreateContext(null) }}
        shortfalls={shortfallList}
        canOverdeliver={canOverdeliver}
        onDecision={handleShortfallDecision}
        processing={creating}
      />
      <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Generar Remito / Albaran"
      size="xl"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
          <div>
            <p className="text-xs text-[#6B7280]">Cliente</p>
            <p className="text-sm font-semibold text-[#F0F2F5]">{clientName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#6B7280]">Pedidos pendientes</p>
            <p className="text-sm font-semibold text-[#FF6600]">{orders.length}</p>
          </div>
        </div>

        {/* Info banner for multi-OC */}
        {orders.length > 1 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FF6600]/10 border border-[#FF6600]/20">
            <AlertCircle size={16} className="text-[#FF6600] mt-0.5 shrink-0" />
            <p className="text-xs text-[#FF6600]">
              Este cliente tiene {orders.length} pedidos pendientes. Podes seleccionar items de varios pedidos para un solo remito.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-10">
            <Loader2 className="animate-spin mx-auto text-[#FF6600] mb-2" size={24} />
            <p className="text-sm text-[#6B7280]">Cargando pedidos pendientes...</p>
          </div>
        )}

        {/* Orders list */}
        {!loading && !previewMode && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {orders.map((order) => (
              <div key={order.id} className="rounded-lg border border-[#2A3040] overflow-hidden">
                {/* Order header */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    order.selected ? 'bg-[#FF6600]/10' : 'bg-[#141820] hover:bg-[#1C2230]'
                  }`}
                  onClick={() => toggleExpanded(order.id)}
                >
                  <input
                    type="checkbox"
                    checked={order.selected}
                    onChange={(e) => { e.stopPropagation(); toggleOrder(order.id) }}
                    className="accent-[#FF6600] w-4 h-4 shrink-0"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Package size={14} className={order.selected ? 'text-[#FF6600]' : 'text-[#6B7280]'} />
                    <span className={`text-sm font-bold font-mono ${order.selected ? 'text-[#FF6600]' : 'text-[#F0F2F5]'}`}>
                      {order.doc_number}
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      ({order.items.length} items pendientes)
                    </span>
                  </div>
                  {order.expanded ? <ChevronDown size={14} className="text-[#6B7280]" /> : <ChevronRight size={14} className="text-[#6B7280]" />}
                </div>

                {/* Order items */}
                {order.expanded && (
                  <div className="border-t border-[#2A3040]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1E2330] text-[#6B7280]">
                          <th className="w-8 px-2 py-2" />
                          <th className="text-left px-3 py-2 w-24">SKU</th>
                          <th className="text-left px-3 py-2">Descripcion</th>
                          <th className="text-right px-3 py-2 w-16">Pedido</th>
                          <th className="text-right px-3 py-2 w-16">Entregado</th>
                          <th className="text-right px-3 py-2 w-16">Pend.</th>
                          <th className="text-center px-3 py-2 w-32">A entregar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item) => (
                          <tr
                            key={item.id}
                            className={`border-b border-[#1E2330] ${item.selected ? 'bg-[#FF6600]/5' : ''}`}
                          >
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItem(order.id, item.id)}
                                className="accent-[#FF6600] w-3.5 h-3.5"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <code className="text-[#9CA3AF] font-mono">{item.sku || '-'}</code>
                            </td>
                            <td className="px-3 py-2 text-[#F0F2F5]">{item.description}</td>
                            <td className="px-3 py-2 text-right text-[#9CA3AF]">{item.ordered}</td>
                            <td className="px-3 py-2 text-right text-[#10B981]">{item.delivered}</td>
                            <td className="px-3 py-2 text-right font-bold text-[#F59E0B]">{item.pending}</td>
                            <td className="px-3 py-2">
                              {item.selected && (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => updateToDeliver(order.id, item.id, item.toDeliver - 1)}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF]"
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <input
                                    type="number"
                                    value={item.toDeliver}
                                    onChange={(e) => updateToDeliver(order.id, item.id, Number(e.target.value))}
                                    className="h-6 w-14 rounded bg-[#0B0E13] border border-[#2A3040] px-1 text-center text-xs font-bold text-[#FF6600] focus:outline-none focus:border-[#FF6600]"
                                  />
                                  <button
                                    onClick={() => updateToDeliver(order.id, item.id, item.toDeliver + 1)}
                                    className="w-6 h-6 flex items-center justify-center rounded bg-[#1E2330] hover:bg-[#2A3040] text-[#9CA3AF]"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {orders.length === 0 && !loading && (
              <div className="text-center py-10 text-[#4B5563]">
                <FileText size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay pedidos pendientes de entrega para este cliente</p>
              </div>
            )}
          </div>
        )}

        {/* Preview mode */}
        {previewMode && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            <h3 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Vista previa del remito</h3>
            {selectedOrders.map((order) => {
              const orderItems = order.items.filter(it => it.selected && it.toDeliver > 0)
              if (orderItems.length === 0) return null
              const orderSubtotal = orderItems.reduce((sum, it) => sum + (it.toDeliver * it.unit_price), 0)
              return (
                <div key={order.id} className="rounded-lg border border-[#2A3040] overflow-hidden">
                  {/* Section header */}
                  <div className="px-4 py-2 bg-[#1C2230] border-b border-[#2A3040]">
                    <span className="text-sm font-bold text-[#FF6600]">
                      {order.doc_number}
                    </span>
                  </div>
                  <div className="px-4 py-2 space-y-1">
                    {orderItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-1 text-xs">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <code className="text-[#9CA3AF] font-mono shrink-0">{item.sku || '-'}</code>
                          <span className="text-[#F0F2F5] truncate">{item.description}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-3">
                          <span className="font-bold text-[#F0F2F5]">{item.toDeliver} uds</span>
                          <span className="text-[#9CA3AF]">{formatCurrency(item.toDeliver * item.unit_price)}</span>
                        </div>
                      </div>
                    ))}
                    {/* Subtotal per order */}
                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-[#1E2330]">
                      <span className="text-xs text-[#6B7280]">Subtotal {order.doc_number}</span>
                      <span className="text-xs font-bold text-[#F0F2F5]">{formatCurrency(orderSubtotal)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer summary + actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#2A3040]">
          <div className="text-xs text-[#6B7280]">
            {selectedOrders.length > 0 ? (
              <span>
                <span className="font-bold text-[#F0F2F5]">{totalItems}</span> items de{' '}
                <span className="font-bold text-[#F0F2F5]">{selectedOrders.length}</span> pedido(s) |{' '}
                <span className="font-bold text-[#FF6600]">{totalUnits}</span> unidades
              </span>
            ) : (
              <span>Selecciona items para generar el remito</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {previewMode ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setPreviewMode(false)}>
                  Volver a editar
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  loading={creating}
                  disabled={selectedOrders.length === 0}
                >
                  <Truck size={14} /> Confirmar remito
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewMode(true)}
                  disabled={selectedOrders.length === 0}
                >
                  Vista previa
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  loading={creating}
                  disabled={selectedOrders.length === 0}
                >
                  <Truck size={14} /> Generar remito
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
    </>
  )
}
