'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, FileX, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
  WorkflowArrowBar,
  type WorkflowStep,
} from '@/components/workflow/workflow-arrow-bar'
import { DocumentHeader } from '@/components/workflow/document-header'
import {
  CriticalAlertsPanel,
  type Alert,
} from '@/components/workflow/critical-alerts-panel'
import { DeliveryProgressCard } from '@/components/workflow/delivery-progress-card'
import {
  DocumentItemsTree,
  type DocumentItem,
  type DocumentItemComponent,
} from '@/components/workflow/document-items-tree'
import {
  SupplierPurchasesCard,
  type SupplierPurchase,
} from '@/components/workflow/supplier-purchases-card'
import {
  StockSnapshotCard,
  type StockSnapshotItem,
} from '@/components/workflow/stock-snapshot-card'
import {
  PendingTasksCard,
  type PendingTask,
} from '@/components/workflow/pending-tasks-card'
import {
  InternalNotesCard,
  type InternalNote,
} from '@/components/workflow/internal-notes-card'
import { DocumentEventsTimeline } from '@/components/documents/document-events-timeline'

// =====================================================
// TIPOS LOCALES (alineados al schema real)
// =====================================================

interface DocRow {
  id: string
  doc_type: string
  subtype?: string | null
  flow_role?: string | null
  system_code: string
  display_ref: string | null
  legal_number?: string | null
  status: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  client_id: string | null
  company_id: string | null
  user_id?: string | null
  assigned_to?: string | null
  incoterm?: string | null
  payment_terms?: string | null
  delivery_date?: string | null
  valid_until?: string | null
  notes?: string | null
  internal_notes?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface DocItemRow {
  id: string
  document_id: string
  product_id: string | null
  sku: string | null
  description: string | null
  quantity: number
  unit_price: number
  subtotal: number
  qty_reserved: number
  qty_delivered: number
  qty_invoiced: number
  qty_received: number
  qty_cancelled: number
  requires_po: boolean
  po_status: string | null
  po_document_id: string | null
  warehouse_id: string | null
  notes: string | null
  sort_order: number
}

interface ClientRow {
  id: string
  company_name: string
  legal_name: string | null
  tax_id: string | null
  country: string | null
  email: string | null
  phone: string | null
}

interface CompanyRow {
  id: string
  name: string
  country: string | null
  currency: string | null
}

interface UserRow {
  id: string
  full_name: string
  short_name: string | null
}

interface LinkRow {
  id: string
  parent_id: string
  child_id: string
  relation_type: string
  fulfillment_pct: number | null
}

// =====================================================
// HELPERS
// =====================================================

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  open: 'Abierto',
  partial: 'Parcial',
  in_process: 'En proceso',
  reserved: 'Reservado',
  delivered: 'Entregado',
  invoiced: 'Facturado',
  paid: 'Pagado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  confirmed: 'Confirmado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6B7280',
  pending: '#FFB300',
  open: '#FF6600',
  partial: '#FFB300',
  in_process: '#4285F4',
  reserved: '#4285F4',
  delivered: '#00C853',
  invoiced: '#EC4899',
  paid: '#10B981',
  completed: '#00C853',
  cancelled: '#FF3D00',
  confirmed: '#4285F4',
}

const TYPE_ICONS: Record<string, string> = {
  lead: '🎯',
  presupuesto: '📋',
  coti: '📋',
  cotizacion: '📋',
  oc_cliente: '📄',
  oc: '📄',
  pedido: '📦',
  sales_order: '📦',
  pap: '🛒',
  factura_compra: '🧾',
  recepcion: '📬',
  albaran: '🚚',
  delivery_note: '🚚',
  factura: '💳',
  factura_abono: '💳',
  cobro: '💰',
}

const TYPE_LABELS: Record<string, string> = {
  lead: 'Lead',
  presupuesto: 'Cotizacion',
  coti: 'Cotizacion',
  cotizacion: 'Cotizacion',
  oc_cliente: 'OC Cliente',
  oc: 'OC Cliente',
  pedido: 'Pedido',
  sales_order: 'Pedido',
  pap: 'Compras',
  factura_compra: 'Factura compra',
  recepcion: 'Recepcion',
  albaran: 'Albaran',
  delivery_note: 'Albaran',
  factura: 'Factura',
  factura_abono: 'Nota credito',
  cobro: 'Cobro',
}

// Orden canonico del flujo Lead -> Cobro
const WORKFLOW_ORDER = [
  'lead',
  'presupuesto',
  'oc_cliente',
  'pedido',
  'pap',
  'albaran',
  'factura',
  'cobro',
]

function normalizeType(type: string): string {
  if (type === 'coti' || type === 'cotizacion') return 'presupuesto'
  if (type === 'sales_order') return 'pedido'
  if (type === 'oc') return 'oc_cliente'
  if (type === 'delivery_note') return 'albaran'
  return type
}

function statusColorFor(status: string): string {
  return STATUS_COLORS[status] || '#6B7280'
}

function statusLabelFor(status: string): string {
  return STATUS_LABELS[status] || status.replace(/_/g, ' ')
}

function itemDeliveryStatus(item: DocItemRow): {
  status: string
  label: string
  color: string
} {
  const qty = Number(item.quantity || 0)
  const delivered = Number(item.qty_delivered || 0)
  const reserved = Number(item.qty_reserved || 0)
  const cancelled = Number(item.qty_cancelled || 0)
  if (cancelled >= qty && qty > 0) {
    return { status: 'cancelled', label: 'Cancelado', color: '#FF3D00' }
  }
  if (delivered >= qty && qty > 0) {
    return { status: 'delivered', label: 'Entregado', color: '#00C853' }
  }
  if (delivered > 0) {
    return { status: 'partial', label: 'Parcial', color: '#FFB300' }
  }
  if (reserved >= qty && qty > 0) {
    return { status: 'reserved', label: 'Reservado', color: '#4285F4' }
  }
  if (item.requires_po) {
    return { status: 'pap', label: 'A pedir', color: '#F59E0B' }
  }
  return { status: 'pending', label: 'Pendiente', color: '#9CA3AF' }
}

function stockIndicatorFor(
  available: number,
  needed: number
): 'ok' | 'low' | 'critical' | 'ordered' {
  if (available <= 0) return 'critical'
  if (available < needed) return 'low'
  return 'ok'
}

function stockSnapshotIndicator(
  available: number
): 'ok' | 'low' | 'critical' | 'zero' {
  if (available <= 0) return 'zero'
  if (available < 5) return 'critical'
  if (available < 20) return 'low'
  return 'ok'
}

function fmtDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new Date(value).toLocaleDateString('es-ES')
  } catch {
    return undefined
  }
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

// =====================================================
// COMPONENTES INTERNOS DE LOADING / ERROR
// =====================================================

function SkeletonLoader() {
  return (
    <div className="space-y-4 sm:space-y-5 px-3 sm:px-5 py-4 animate-pulse">
      <div className="h-12 rounded-xl bg-[#141820] border border-[#1E2330]" />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4 lg:gap-5">
        <div className="space-y-4">
          <div className="h-32 rounded-xl bg-[#141820] border border-[#1E2330]" />
          <div className="h-40 rounded-xl bg-[#141820] border border-[#1E2330]" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-[#141820] border border-[#1E2330]" />
          <div className="h-72 rounded-xl bg-[#141820] border border-[#1E2330]" />
        </div>
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-[#141820] border border-[#1E2330]" />
          <div className="h-32 rounded-xl bg-[#141820] border border-[#1E2330]" />
        </div>
      </div>
    </div>
  )
}

function ErrorState({
  message,
  onBack,
}: {
  message: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="bg-[#141820] border border-[#2A3040] rounded-xl p-6 sm:p-8 text-center max-w-md w-full">
        <div className="w-12 h-12 rounded-full bg-[#FF3D00]/15 flex items-center justify-center mx-auto mb-4">
          <FileX size={22} className="text-[#FF3D00]" />
        </div>
        <h2 className="text-lg font-bold text-[#F0F2F5] mb-1">
          Documento no encontrado
        </h2>
        <p className="text-sm text-[#9CA3AF] mb-5">{message}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF6600] hover:bg-[#FF8833] text-white text-sm font-semibold transition-colors"
        >
          <ArrowLeft size={14} /> Volver a Ventas
        </button>
      </div>
    </div>
  )
}

// =====================================================
// PAGE
// =====================================================

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const docId = (params?.id as string) || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocRow | null>(null)
  const [items, setItems] = useState<DocItemRow[]>([])
  const [client, setClient] = useState<ClientRow | null>(null)
  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [assignedUser, setAssignedUser] = useState<UserRow | null>(null)
  const [chainDocs, setChainDocs] = useState<DocRow[]>([])
  const [stockSnapshot, setStockSnapshot] = useState<StockSnapshotItem[]>([])
  const [supplierPurchases, setSupplierPurchases] = useState<SupplierPurchase[]>([])
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [notes, setNotes] = useState<InternalNote[]>([])

  // ---- LOAD ----
  useEffect(() => {
    if (!docId) {
      setError('ID de documento invalido')
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      const sb = createClient()

      // 1) Documento + lines + relations + events — vía endpoint API
      //    (service_role bypass de RLS). El endpoint devuelve TODO en una
      //    sola request, así evitamos RLS bloqueando items/relations.
      let docData: DocRow | null = null
      let apiLines: DocItemRow[] = []
      let apiRelations: LinkRow[] = []
      try {
        const res = await fetch(`/api/documents/${docId}`, { credentials: 'include' })
        if (cancelled) return
        if (!res.ok) {
          if (res.status === 403) setError('No tenés acceso a este documento.')
          else if (res.status === 404) setError('Documento no encontrado.')
          else setError(`No se pudo cargar el documento (HTTP ${res.status}).`)
          setLoading(false)
          return
        }
        const j = await res.json()
        docData = (j.document || null) as DocRow | null
        apiLines = ((j.lines || []) as DocItemRow[])
        // El endpoint devuelve relations_out (yo soy parent) y relations_in
        // (yo soy child). Las concatenamos en formato LinkRow.
        const relsOut = ((j.relations_out || []) as Array<{ id: string; source_document_id: string; target_document_id: string; relation_type: string; fulfillment_pct?: number | null }>)
          .map(r => ({ id: r.id, parent_id: r.source_document_id, child_id: r.target_document_id, relation_type: r.relation_type, fulfillment_pct: r.fulfillment_pct ?? null }))
        const relsIn = ((j.relations_in || []) as Array<{ id: string; source_document_id: string; target_document_id: string; relation_type: string; fulfillment_pct?: number | null }>)
          .map(r => ({ id: r.id, parent_id: r.source_document_id, child_id: r.target_document_id, relation_type: r.relation_type, fulfillment_pct: r.fulfillment_pct ?? null }))
        apiRelations = [...relsOut, ...relsIn]
      } catch (e) {
        if (cancelled) return
        setError(`Error de red: ${(e as Error).message}`)
        setLoading(false)
        return
      }

      if (cancelled) return
      if (!docData) {
        setError('No se pudo cargar el documento solicitado.')
        setLoading(false)
        return
      }

      setDoc(docData)
      // Ordenar lines por sort_order (el endpoint usa line_number; fallback a sort_order)
      setItems(apiLines.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))

      // 2) En paralelo: client, company (no requieren API porque RLS de esas
      //    tablas suele ser permisivo o el user tiene acceso multi-empresa).
      //    linksRes = apiRelations ya cargado arriba.
      const [clientRes, companyRes] = await Promise.all([
        docData.client_id
          ? sb
              .from('tt_clients')
              .select('id, company_name, legal_name, tax_id, country, email, phone')
              .eq('id', docData.client_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        docData.company_id
          ? sb
              .from('tt_companies')
              .select('id, name, country, currency')
              .eq('id', docData.company_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      const linksRes = { data: apiRelations, error: null }

      if (cancelled) return

      setClient((clientRes.data as ClientRow | null) || null)
      setCompany((companyRes.data as CompanyRow | null) || null)

      // 3) Asignado (vendedor)
      if (docData.assigned_to) {
        const { data: userData } = await sb
          .from('tt_users')
          .select('id, full_name, short_name')
          .eq('id', docData.assigned_to)
          .maybeSingle()
        if (!cancelled) setAssignedUser((userData as UserRow | null) || null)
      } else if (docData.user_id) {
        const { data: userData } = await sb
          .from('tt_users')
          .select('id, full_name, short_name')
          .eq('id', docData.user_id)
          .maybeSingle()
        if (!cancelled) setAssignedUser((userData as UserRow | null) || null)
      }

      // 4) Workflow chain: BFS por links
      const linkRows = (linksRes.data || []) as LinkRow[]
      const relatedIds = new Set<string>()
      relatedIds.add(docId)
      for (const link of linkRows) {
        relatedIds.add(link.parent_id)
        relatedIds.add(link.child_id)
      }

      // Hacer 1 hop adicional para reconstruir cadenas mas largas
      if (linkRows.length > 0 && relatedIds.size > 1) {
        const otherIds = Array.from(relatedIds).filter((id) => id !== docId)
        if (otherIds.length > 0) {
          const { data: extraLinks } = await sb
            .from('tt_document_relations')
            .select('id, parent_id, child_id, relation_type, fulfillment_pct')
            .or(
              `parent_id.in.(${otherIds.join(',')}),child_id.in.(${otherIds.join(',')})`
            )
          for (const link of (extraLinks || []) as LinkRow[]) {
            relatedIds.add(link.parent_id)
            relatedIds.add(link.child_id)
          }
        }
      }

      const idsToFetch = Array.from(relatedIds).filter((id) => id !== docId)
      let extraDocs: DocRow[] = []
      if (idsToFetch.length > 0) {
        const { data: chainData } = await sb
          .from('tt_documents')
          .select(
            'id, doc_type, system_code, display_ref, status, created_at, total, currency, subtotal, tax_amount, client_id, company_id'
          )
          .in('id', idsToFetch)
        extraDocs = (chainData || []) as DocRow[]
      }

      if (cancelled) return

      const allDocs = [docData as DocRow, ...extraDocs]
      setChainDocs(allDocs)

      // 5) Compras a proveedor (PAPs vinculadas)
      const papDocs = allDocs.filter(
        (d) => normalizeType(d.doc_type) === 'pap' || d.doc_type === 'factura_compra'
      )
      if (papDocs.length > 0) {
        // Para mostrar proveedor traemos los items de los PAPs no necesarios; el "supplier" lo obtenemos via metadata o client (los PAPs apuntan al proveedor a traves de client_id si la convencion lo permite)
        const papWithSupplier = await Promise.all(
          papDocs.map(async (p) => {
            let supplier = 'Proveedor'
            const meta = (p.metadata || {}) as Record<string, unknown>
            const metaSupplier = (meta.supplier_name || meta.proveedor) as
              | string
              | undefined
            if (metaSupplier) supplier = metaSupplier
            // intentar via tt_purchase_orders
            try {
              const { data: po } = await sb
                .from('tt_purchase_orders')
                .select('supplier_name, supplier_id')
                .eq('document_id', p.id)
                .maybeSingle()
              if (po && (po as { supplier_name?: string }).supplier_name) {
                supplier = (po as { supplier_name: string }).supplier_name
              }
            } catch {
              // ignore
            }
            // contar items
            const { count } = await sb
              .from('tt_document_lines')
              .select('id', { count: 'exact', head: true })
              .eq('document_id', p.id)

            const arrival = p.delivery_date || null
            const today = new Date().toISOString().slice(0, 10)
            const overdue =
              !!arrival &&
              p.status !== 'completed' &&
              p.status !== 'received' &&
              new Date(arrival).getTime() < new Date(today).getTime()
            const daysOverdue = arrival ? daysBetween(arrival, today) : 0

            return {
              id: p.id,
              ref: p.display_ref || p.system_code,
              supplier,
              status: p.status,
              statusColor: statusColorFor(p.status),
              expectedArrival: fmtDate(arrival),
              isOverdue: overdue,
              daysOverdue: overdue ? daysOverdue : undefined,
              total: Number(p.total || 0),
              currency: p.currency || 'EUR',
              itemCount: count || 0,
            } as SupplierPurchase
          })
        )
        if (!cancelled) setSupplierPurchases(papWithSupplier)
      }

      // 6) Stock snapshot por SKUs
      const productIds = apiLines
        .map((i: DocItemRow) => i.product_id)
        .filter((x: string | null): x is string => !!x)

      if (productIds.length > 0) {
        try {
          const [stockRes, productsRes] = await Promise.all([
            sb
              .from('tt_stock')
              .select('product_id, quantity, reserved')
              .in('product_id', productIds),
            sb
              .from('tt_products')
              .select('id, sku, name')
              .in('id', productIds),
          ])

          const productsMap = new Map<
            string,
            { sku: string; name: string }
          >()
          for (const p of (productsRes.data || []) as Array<{
            id: string
            sku: string
            name: string
          }>) {
            productsMap.set(p.id, { sku: p.sku, name: p.name })
          }

          // Agregar stock por producto sumando warehouses
          const stockAgg = new Map<
            string,
            { quantity: number; reserved: number }
          >()
          for (const s of (stockRes.data || []) as Array<{
            product_id: string
            quantity: number
            reserved: number
          }>) {
            const cur = stockAgg.get(s.product_id) || { quantity: 0, reserved: 0 }
            cur.quantity += Number(s.quantity || 0)
            cur.reserved += Number(s.reserved || 0)
            stockAgg.set(s.product_id, cur)
          }

          const snapshot: StockSnapshotItem[] = productIds
            .map((pid: string) => {
              const meta = productsMap.get(pid)
              if (!meta) return null
              const st = stockAgg.get(pid) || { quantity: 0, reserved: 0 }
              const available = Math.max(0, st.quantity - st.reserved)
              return {
                productId: pid,
                productName: meta.name,
                sku: meta.sku,
                stockReal: st.quantity,
                stockReserved: st.reserved,
                stockAvailable: available,
                stockInTransit: 0,
                assignedOrders: [],
                indicator: stockSnapshotIndicator(available),
              } as StockSnapshotItem
            })
            .filter((x: StockSnapshotItem | null): x is StockSnapshotItem => x !== null)

          if (!cancelled) setStockSnapshot(snapshot)
        } catch (e) {
          console.warn('stock snapshot failed:', e)
        }
      }

      // 7) Notas internas (de docData.metadata.notes y campo internal_notes)
      const noteList: InternalNote[] = []
      if (docData.internal_notes) {
        noteList.push({
          id: 'internal-notes-base',
          author: 'Sistema',
          authorInitials: 'SY',
          content: docData.internal_notes,
          createdAt: fmtDate(docData.created_at) || '',
          isSystem: true,
        })
      }
      const meta = (docData.metadata || {}) as Record<string, unknown>
      const metaNotes = meta.notes
      if (Array.isArray(metaNotes)) {
        for (const n of metaNotes as Array<Record<string, unknown>>) {
          if (typeof n === 'object' && n) {
            const author = (n.author as string) || 'Usuario'
            noteList.push({
              id: (n.id as string) || crypto.randomUUID(),
              author,
              authorInitials: initialsFrom(author),
              content: (n.content as string) || '',
              createdAt: (n.created_at as string)
                ? fmtDate(n.created_at as string) || ''
                : '',
              isSystem: !!n.is_system,
            })
          }
        }
      }
      if (!cancelled) setNotes(noteList)

      // 8) Tareas: vacio (no hay tabla dedicada)
      if (!cancelled) setTasks([])

      if (!cancelled) setLoading(false)
    }

    load().catch((e) => {
      console.error('Document detail load failed:', e)
      if (!cancelled) {
        setError('Error inesperado al cargar el documento.')
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [docId])

  // ---- DERIVED ----
  const workflowSteps: WorkflowStep[] = useMemo(() => {
    if (!doc) return []
    // Mapear doc por tipo normalizado, quedandonos con el mas reciente por tipo
    const byType = new Map<string, DocRow>()
    for (const d of chainDocs) {
      const normType = normalizeType(d.doc_type)
      const existing = byType.get(normType)
      if (
        !existing ||
        new Date(d.created_at).getTime() > new Date(existing.created_at).getTime()
      ) {
        byType.set(normType, d)
      }
    }

    const currentNormType = normalizeType(doc.doc_type)

    const steps: WorkflowStep[] = WORKFLOW_ORDER.map((key) => {
      const linked = byType.get(key)
      const isCurrent = key === currentNormType
      let status: WorkflowStep['status'] = 'pending'
      if (linked) {
        if (isCurrent) {
          status =
            linked.status === 'completed' || linked.status === 'paid'
              ? 'completed'
              : linked.status === 'partial'
              ? 'partial'
              : 'current'
        } else {
          if (
            linked.status === 'completed' ||
            linked.status === 'invoiced' ||
            linked.status === 'paid' ||
            linked.status === 'delivered'
          ) {
            status = 'completed'
          } else if (linked.status === 'partial') {
            status = 'partial'
          } else if (linked.status === 'cancelled') {
            status = 'blocked'
          } else {
            status = 'completed'
          }
        }
      } else if (isCurrent) {
        status = 'current'
      }

      return {
        key,
        label: TYPE_LABELS[key] || key,
        icon: TYPE_ICONS[key] || '📄',
        status,
        documentRef: linked?.display_ref || linked?.system_code,
        documentId: linked?.id,
        date: linked ? fmtDate(linked.created_at) : undefined,
        tooltip: linked
          ? `${TYPE_LABELS[key]} ${statusLabelFor(linked.status)}`
          : 'Pendiente',
      }
    })

    return steps
  }, [chainDocs, doc])

  const docItems: DocumentItem[] = useMemo(() => {
    if (!items.length) return []
    return items.map((it) => {
      const status = itemDeliveryStatus(it)
      const stockMatch = stockSnapshot.find(
        (s) => s.productId === it.product_id
      )
      const stockAvailable = stockMatch?.stockAvailable ?? 0
      const stockReserved = stockMatch?.stockReserved ?? 0
      const indicator = stockIndicatorFor(
        stockAvailable,
        Math.max(Number(it.quantity || 0) - Number(it.qty_delivered || 0), 0)
      )
      return {
        id: it.id,
        sku: it.sku || '',
        description: it.description || '',
        quantity: Number(it.quantity || 0),
        unit_price: Number(it.unit_price || 0),
        subtotal: Number(it.subtotal || 0),
        qty_delivered: Number(it.qty_delivered || 0),
        qty_invoiced: Number(it.qty_invoiced || 0),
        qty_reserved: Number(it.qty_reserved || 0),
        status: status.status,
        statusLabel: status.label,
        statusColor: status.color,
        stockAvailable,
        stockReserved,
        stockIndicator: indicator,
        requires_po: !!it.requires_po,
        po_status: it.po_status || undefined,
        notes: it.notes || undefined,
        hasComponents: false,
      }
    })
  }, [items, stockSnapshot])

  const docComponents: DocumentItemComponent[] = useMemo(() => [], [])

  const alerts: Alert[] = useMemo(() => {
    if (!doc) return []
    const out: Alert[] = []
    const today = new Date().toISOString().slice(0, 10)

    if (
      doc.delivery_date &&
      doc.status !== 'completed' &&
      doc.status !== 'cancelled' &&
      new Date(doc.delivery_date).getTime() < new Date(today).getTime()
    ) {
      out.push({
        id: 'delivery-overdue',
        type: 'delivery',
        severity: 'urgent',
        title: 'Fecha de entrega vencida',
        description: `Comprometida para ${fmtDate(doc.delivery_date)} y aun pendiente.`,
        documentRef: doc.display_ref || doc.system_code,
        dueDate: fmtDate(doc.delivery_date),
        status: 'active',
      })
    }

    if (
      doc.valid_until &&
      doc.status === 'draft' &&
      new Date(doc.valid_until).getTime() < new Date(today).getTime()
    ) {
      out.push({
        id: 'validity-expired',
        type: 'quote',
        severity: 'warning',
        title: 'Cotizacion vencida',
        description: `Validez expirada el ${fmtDate(doc.valid_until)}.`,
        documentRef: doc.display_ref || doc.system_code,
        status: 'active',
      })
    }

    const itemsSinStock = docItems.filter(
      (i) => i.stockIndicator === 'critical' && !i.requires_po
    )
    if (itemsSinStock.length > 0) {
      out.push({
        id: 'stock-critical',
        type: 'stock',
        severity: 'critical',
        title: `${itemsSinStock.length} item${itemsSinStock.length === 1 ? '' : 's'} sin stock`,
        description: 'Hay lineas con stock insuficiente y sin pedido a proveedor.',
        status: 'active',
      })
    }

    const overduePaps = supplierPurchases.filter((p) => p.isOverdue)
    if (overduePaps.length > 0) {
      out.push({
        id: 'pap-overdue',
        type: 'purchase',
        severity: 'urgent',
        title: `${overduePaps.length} compra${overduePaps.length === 1 ? '' : 's'} a proveedor atrasada${overduePaps.length === 1 ? '' : 's'}`,
        description: 'Revisar el estado de los pedidos a proveedor.',
        status: 'active',
      })
    }

    return out
  }, [doc, docItems, supplierPurchases])

  // Progreso global del pedido (entregado / facturado / cobrado)
  const deliveredPct = useMemo(() => {
    if (!docItems.length) return 0
    const totalQ = docItems.reduce((s, i) => s + i.quantity, 0)
    const delivered = docItems.reduce((s, i) => s + i.qty_delivered, 0)
    return totalQ > 0 ? Math.round((delivered / totalQ) * 100) : 0
  }, [docItems])

  const invoicedPct = useMemo(() => {
    if (!docItems.length) return 0
    const totalQ = docItems.reduce((s, i) => s + i.quantity, 0)
    const invoiced = docItems.reduce((s, i) => s + i.qty_invoiced, 0)
    return totalQ > 0 ? Math.round((invoiced / totalQ) * 100) : 0
  }, [docItems])

  const collectedPct = useMemo(() => {
    if (!doc) return 0
    if (doc.status === 'paid') return 100
    if (doc.status === 'invoiced' || doc.status === 'completed') return invoicedPct
    return 0
  }, [doc, invoicedPct])

  const itemStatusPills = useMemo(() => {
    const map: Record<string, { count: number; color: string; label: string }> =
      {}
    for (const it of docItems) {
      const key = it.status
      if (!map[key])
        map[key] = { count: 0, color: it.statusColor, label: it.statusLabel }
      map[key].count++
    }
    return Object.values(map).map((m) => ({
      label: `${m.count} ${m.label}`,
      color: m.color,
    }))
  }, [docItems])

  // Parent docs for header (docs upstream in the chain)
  const parentDocs = useMemo(() => {
    if (!doc) return []
    const currentIdx = WORKFLOW_ORDER.indexOf(normalizeType(doc.doc_type))
    if (currentIdx <= 0) return []
    const byType = new Map<string, DocRow>()
    for (const d of chainDocs) {
      if (d.id === doc.id) continue
      byType.set(normalizeType(d.doc_type), d)
    }
    const upstream = WORKFLOW_ORDER.slice(0, currentIdx)
      .map((t) => byType.get(t))
      .filter((d): d is DocRow => !!d)
    return upstream.map((d) => ({
      id: d.id,
      type: normalizeType(d.doc_type),
      ref: d.display_ref || d.system_code,
    }))
  }, [doc, chainDocs])

  // ---- HANDLERS ----
  const handleAddNote = async (content: string) => {
    if (!doc) return
    const sb = createClient()
    const author = assignedUser?.full_name || 'Usuario'
    const newNote = {
      id: crypto.randomUUID(),
      author,
      content,
      created_at: new Date().toISOString(),
      is_system: false,
    }
    const meta = (doc.metadata || {}) as Record<string, unknown>
    const existing = Array.isArray(meta.notes)
      ? (meta.notes as Array<Record<string, unknown>>)
      : []
    const nextNotes = [...existing, newNote]
    const nextMeta = { ...meta, notes: nextNotes }

    const { error: updErr } = await sb
      .from('tt_documents')
      .update({ metadata: nextMeta })
      .eq('id', doc.id)

    if (updErr) {
      console.warn('No se pudo guardar la nota:', updErr)
      addToast({
        type: 'error',
        title: 'No se pudo guardar la nota',
        message: updErr.message,
      })
      return
    }

    setDoc({ ...doc, metadata: nextMeta })
    setNotes((prev) => [
      ...prev,
      {
        id: newNote.id,
        author,
        authorInitials: initialsFrom(author),
        content,
        createdAt: fmtDate(newNote.created_at) || '',
      },
    ])
    addToast({ type: 'success', title: 'Nota agregada' })
  }

  const handleRefChange = async (newRef: string) => {
    if (!doc) return
    const sb = createClient()
    const { error: updErr } = await sb
      .from('tt_documents')
      .update({ display_ref: newRef })
      .eq('id', doc.id)
    if (updErr) {
      addToast({
        type: 'error',
        title: 'No se pudo actualizar la referencia',
        message: updErr.message,
      })
      return
    }
    setDoc({ ...doc, display_ref: newRef })
    addToast({ type: 'success', title: 'Referencia actualizada' })
  }

  const handleStepClick = (step: WorkflowStep) => {
    if (step.documentId && step.documentId !== docId) {
      router.push(`/documentos/${step.documentId}`)
    }
  }

  // ---- RENDER ----
  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-2 px-3 sm:px-5 pt-4 text-xs text-[#9CA3AF]">
          <Loader2 size={14} className="animate-spin text-[#FF6600]" />
          Cargando documento...
        </div>
        <SkeletonLoader />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onBack={() => router.push('/ventas')} />
  }

  if (!doc) return null

  const headerDoc = {
    id: doc.id,
    type: normalizeType(doc.doc_type),
    system_code: doc.system_code,
    display_ref: doc.display_ref || doc.system_code,
    status: doc.status,
    currency: doc.currency || 'EUR',
    total: Number(doc.total || 0),
    subtotal: Number(doc.subtotal || 0),
    tax_amount: Number(doc.tax_amount || 0),
    delivery_date: doc.delivery_date || undefined,
    incoterm: doc.incoterm || undefined,
    payment_terms: doc.payment_terms || undefined,
    created_at: doc.created_at,
  }

  const headerClient = client
    ? {
        id: client.id,
        name: client.legal_name || client.company_name,
        tax_id: client.tax_id || undefined,
        country: client.country || undefined,
      }
    : undefined

  const headerCompany = company
    ? {
        id: company.id,
        name: company.name,
        country: company.country || undefined,
      }
    : undefined

  const showSupplierPurchases =
    supplierPurchases.length > 0 ||
    normalizeType(doc.doc_type) === 'pedido' ||
    normalizeType(doc.doc_type) === 'pap'
  const showStockSnapshot = stockSnapshot.length > 0

  return (
    <div className="space-y-4 sm:space-y-5 px-3 sm:px-5 py-4 pb-24 lg:pb-6">
      {/* Workflow arrow bar — overflow horizontal en mobile */}
      <div className="-mx-3 sm:mx-0">
        <div className="px-3 sm:px-0">
          <WorkflowArrowBar
            steps={workflowSteps}
            onStepClick={handleStepClick}
          />
        </div>
      </div>

      {/* Layout: 1 col mobile, 3 col desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-4 lg:gap-5">
        {/* Sidebar izquierdo */}
        <div className="space-y-4 order-2 lg:order-1">
          {alerts.length > 0 ? (
            <CriticalAlertsPanel alerts={alerts} />
          ) : (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-3">
              <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide mb-1">
                Alertas
              </h3>
              <p className="text-xs text-[#6B7280]">Sin alertas criticas</p>
            </div>
          )}

          {(normalizeType(doc.doc_type) === 'pedido' ||
            normalizeType(doc.doc_type) === 'albaran' ||
            normalizeType(doc.doc_type) === 'factura') && (
            <DeliveryProgressCard
              clientName={
                client?.legal_name || client?.company_name || 'Cliente'
              }
              deliveredPct={deliveredPct}
              invoicedPct={invoicedPct}
              collectedPct={collectedPct}
              itemStatuses={itemStatusPills}
              ocRef={doc.display_ref || doc.system_code}
            />
          )}

          {showSupplierPurchases && supplierPurchases.length > 0 && (
            <SupplierPurchasesCard
              purchases={supplierPurchases}
              onPurchaseClick={(p) => router.push(`/documentos/${p.id}`)}
            />
          )}
          {showSupplierPurchases && supplierPurchases.length === 0 && (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-3">
              <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide mb-1">
                Compras a proveedor
              </h3>
              <p className="text-xs text-[#6B7280]">
                No hay pedidos a proveedor vinculados.
              </p>
            </div>
          )}
        </div>

        {/* Centro */}
        <div className="space-y-4 order-1 lg:order-2 min-w-0">
          <DocumentHeader
            document={headerDoc}
            client={headerClient}
            company={headerCompany}
            assignedTo={
              assignedUser?.short_name || assignedUser?.full_name || undefined
            }
            parentDocs={parentDocs}
            onRefChange={handleRefChange}
          />

          {docItems.length > 0 ? (
            <div className="-mx-3 sm:mx-0 overflow-x-auto sm:overflow-visible">
              <div className="min-w-[640px] sm:min-w-0 px-3 sm:px-0">
                <DocumentItemsTree
                  items={docItems}
                  components={docComponents}
                  showStock={showStockSnapshot}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-6 text-center">
              <p className="text-xs text-[#6B7280]">
                Este documento no tiene items.
              </p>
            </div>
          )}

          <InternalNotesCard notes={notes} onAddNote={handleAddNote} />
        </div>

        {/* Sidebar derecho */}
        <div className="space-y-4 order-3">
          {showStockSnapshot && (
            <StockSnapshotCard
              items={stockSnapshot}
              warehouseName="Total"
            />
          )}

          {tasks.length > 0 ? (
            <PendingTasksCard tasks={tasks} />
          ) : (
            <div className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-3">
              <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide mb-1">
                Tareas pendientes
              </h3>
              <p className="text-xs text-[#6B7280]">
                No hay tareas asignadas.
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              Sprint 2A — Timeline de eventos (audit log cronológico)
              Lee de tt_document_events vía /api/documents/[id]/events.
              Append-only: cada operación importante (creación, derivación,
              cambio de estado, emisión, etc.) deja un evento.
              ════════════════════════════════════════════════════════════ */}
          <div className="bg-[#141820] rounded-xl border border-[#2A3040] px-4 py-3">
            <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide mb-3">
              Línea de tiempo
            </h3>
            <DocumentEventsTimeline documentId={doc.id} limit={50} />
          </div>
        </div>
      </div>
    </div>
  )
}
