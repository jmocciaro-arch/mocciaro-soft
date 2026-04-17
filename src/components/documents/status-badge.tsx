import { Badge } from '@/components/ui/badge'
import type { DocStatus, DocType } from '@/lib/schemas/documents'

// Mapa status → variant del Badge + label humano.
const STATUS_STYLE: Record<DocStatus, { variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'; label: string }> = {
  draft:                { variant: 'warning', label: 'Borrador' },
  issued:               { variant: 'info',    label: 'Emitido' },
  sent:                 { variant: 'info',    label: 'Enviado' },
  accepted:             { variant: 'success', label: 'Aceptado' },
  rejected:             { variant: 'danger',  label: 'Rechazado' },
  partially_delivered:  { variant: 'orange',  label: 'Entrega parcial' },
  delivered:            { variant: 'success', label: 'Entregado' },
  partially_invoiced:   { variant: 'orange',  label: 'Factura parcial' },
  invoiced:             { variant: 'success', label: 'Facturado' },
  paid:                 { variant: 'success', label: 'Pagado' },
  cancelled:            { variant: 'danger',  label: 'Cancelado' },
  voided:               { variant: 'danger',  label: 'Anulado' },
}

export function StatusBadge({ status }: { status: DocStatus }) {
  const s = STATUS_STYLE[status] ?? { variant: 'default' as const, label: status }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const DOC_TYPE_LABEL: Record<DocType, string> = {
  quote:          'Cotización',
  sales_order:    'Orden de venta',
  purchase_order: 'Orden de compra',
  delivery_note:  'Remito',
  invoice:        'Factura',
  proforma:       'Proforma',
  receipt:        'Recibo',
  internal:       'Interno',
  credit_note:    'Nota de crédito',
  debit_note:     'Nota de débito',
}

export function docTypeLabel(t: DocType): string {
  return DOC_TYPE_LABEL[t] ?? t
}

export function DocTypeBadge({ docType }: { docType: DocType }) {
  return <Badge variant="default">{docTypeLabel(docType)}</Badge>
}
