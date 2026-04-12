/**
 * Helpers para convertir tt_documents + tablas locales en rows
 * aptas para el DataTable de StelOrder-style.
 */

type Row = Record<string, unknown>

// ---------------------------------------------------------------
// STATUS MAPS (display labels en espaniol)
// ---------------------------------------------------------------
const DOC_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  borrador: 'Borrador',
  sent: 'Enviada',
  enviada: 'Enviada',
  accepted: 'Aceptada',
  aceptada: 'Aceptada',
  rejected: 'Rechazada',
  rechazada: 'Rechazada',
  closed: 'Cerrado',
  open: 'Abierto',
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagada',
  completed: 'Completado',
  cancelled: 'Cancelado',
  received: 'Recibida',
  partially_delivered: 'Entrega parcial',
  fully_delivered: 'Entregado',
  partially_invoiced: 'Facturacion parcial',
  fully_invoiced: 'Facturado',
  delivered: 'Entregado',
  invoiced: 'Facturado',
  due_soon: 'Vence pronto',
  overdue: 'Vencida',
}

export function mapStatus(status: string | null | undefined): string {
  if (!status) return 'Borrador'
  return DOC_STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

// ---------------------------------------------------------------
// EXTRACT CLIENT / SUPPLIER NAME from tt_documents
// ---------------------------------------------------------------
export function extractClientName(doc: Row): string {
  const raw = (doc.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
  if (!raw) return (doc.client_name as string) || (doc.supplier_name as string) || 'Sin asignar'
  return (raw['account-name'] as string) || (raw['legal-name'] as string) || (raw['name'] as string) || 'Sin asignar'
}

export function extractDocRef(doc: Row): string {
  return (doc.display_ref as string)
    || ((doc.metadata as Record<string, unknown>)?.stelorder_reference as string)
    || (doc.system_code as string)
    || '-'
}

// ---------------------------------------------------------------
// GENERIC: tt_documents -> table row
// ---------------------------------------------------------------
export function documentToTableRow(doc: Row): Record<string, unknown> {
  const raw = (doc.metadata as Record<string, unknown>)?.stelorder_raw as Record<string, unknown> | undefined
  return {
    id: doc.id,
    referencia: (doc.display_ref as string) || (raw?.reference as string) || (doc.system_code as string) || '-',
    cliente: extractClientName(doc),
    titulo: (raw?.addendum as string) || (raw?.['private-comments'] as string) || (doc.notes as string) || '',
    estado: mapStatus(doc.status as string),
    fecha: doc.created_at,
    importe: (doc.total as number) || 0,
    moneda: (doc.currency as string) || 'EUR',
    creado_por: (raw?.['employee-name'] as string) || '',
    _raw: doc,
  }
}

// ---------------------------------------------------------------
// LOCAL QUOTES (tt_quotes) -> table row
// ---------------------------------------------------------------
export function localQuoteToRow(q: Row): Record<string, unknown> {
  const clientObj = q.tt_clients as Record<string, unknown> | undefined
  return {
    id: q.id,
    referencia: (q.doc_number as string) || (q.number as string) || '-',
    cliente: (clientObj?.name as string) || (q.client_name as string) || 'Sin cliente',
    titulo: (q.notes as string) || '',
    estado: mapStatus(q.status as string),
    fecha: q.created_at,
    importe: (q.total as number) || 0,
    moneda: (q.currency as string) || 'EUR',
    creado_por: '',
    _raw: q,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// LOCAL SALES ORDERS (tt_sales_orders) -> table row
// ---------------------------------------------------------------
export function localSOToRow(so: Row): Record<string, unknown> {
  const clientObj = so.tt_clients as Record<string, unknown> | undefined
  return {
    id: so.id,
    referencia: (so.doc_number as string) || '-',
    cliente: (clientObj?.name as string) || 'Sin cliente',
    titulo: (so.notes as string) || '',
    estado: mapStatus(so.status as string),
    fecha: so.created_at,
    importe: (so.total as number) || 0,
    moneda: (so.currency as string) || 'EUR',
    creado_por: '',
    _raw: so,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// LOCAL DELIVERY NOTES (tt_delivery_notes) -> table row
// ---------------------------------------------------------------
export function localDNToRow(dn: Row): Record<string, unknown> {
  const clientObj = dn.tt_clients as Record<string, unknown> | undefined
  const soObj = dn.tt_sales_orders as Record<string, unknown> | undefined
  return {
    id: dn.id,
    referencia: (dn.doc_number as string) || '-',
    cliente: (clientObj?.name as string) || '-',
    titulo: soObj ? `Pedido ${soObj.doc_number}` : '',
    estado: mapStatus(dn.status as string),
    fecha: dn.created_at,
    importe: (dn.total as number) || 0,
    moneda: 'EUR',
    creado_por: '',
    _raw: dn,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// LOCAL INVOICES (tt_invoices) -> table row
// ---------------------------------------------------------------
export function localInvoiceToRow(inv: Row): Record<string, unknown> {
  const clientObj = inv.tt_clients as Record<string, unknown> | undefined
  return {
    id: inv.id,
    referencia: (inv.doc_number as string) || '-',
    cliente: (clientObj?.name as string) || '-',
    titulo: '',
    estado: mapStatus(inv.status as string),
    fecha: inv.created_at,
    importe: (inv.total as number) || 0,
    moneda: (inv.currency as string) || 'EUR',
    creado_por: '',
    _raw: inv,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// PAYMENTS (tt_payments) -> table row
// ---------------------------------------------------------------
export function paymentToRow(p: Row): Record<string, unknown> {
  const invObj = p.tt_invoices as Record<string, unknown> | undefined
  return {
    id: p.id,
    referencia: (invObj?.doc_number as string) || '-',
    cliente: `Cobro ${(invObj?.doc_number as string) || '-'}`,
    concepto: (p.method as string) || 'transferencia',
    estado: mapStatus(p.status as string),
    fecha: p.created_at,
    importe: (p.amount as number) || 0,
    moneda: 'EUR',
    _raw: p,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// PURCHASE ORDERS (tt_purchase_orders) -> table row
// ---------------------------------------------------------------
export function localPOToRow(po: Row): Record<string, unknown> {
  return {
    id: po.id,
    referencia: (po.doc_number as string) || (po.number as string) || '-',
    proveedor: (po.supplier_name as string) || 'Sin proveedor',
    titulo: (po.notes as string) || '',
    estado: mapStatus(po.status as string),
    fecha: po.created_at,
    importe: (po.total as number) || 0,
    moneda: (po.currency as string) || 'EUR',
    _raw: po,
    _source: 'local',
  }
}

// ---------------------------------------------------------------
// PURCHASE INVOICES -> table row
// ---------------------------------------------------------------
export function purchaseInvoiceToRow(inv: Row): Record<string, unknown> {
  return {
    id: inv.id,
    referencia: (inv.number as string) || '-',
    proveedor: (inv.supplier_name as string) || '-',
    ref_proveedor: (inv.supplier_invoice_number as string) || '',
    estado: mapStatus((inv._display_status as string) || (inv.status as string)),
    fecha: inv.created_at || inv.invoice_date,
    importe: (inv.total as number) || 0,
    moneda: (inv.currency as string) || 'EUR',
    fecha_vencimiento: inv.due_date,
    _raw: inv,
    _source: 'local',
  }
}
