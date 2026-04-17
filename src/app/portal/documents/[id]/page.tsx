'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface DocData {
  system_code?: string
  type?: string
  status?: string
  total?: number
  currency?: string
  notes?: string
  invoice_date?: string
  incoterm?: string
  payment_terms?: string
  shipping_carrier?: string
  shipping_tracking_number?: string
  shipping_tracking_url?: string
  metadata?: any
  company?: {
    name?: string
    trade_name?: string
    legal_name?: string
    brand_color?: string
    logo_url?: string
    phone?: string
    email_main?: string
    website?: string
  }
  client?: { name?: string; legal_name?: string }
  items?: Array<{ sku?: string; description?: string; quantity?: number; unit_price?: number; subtotal?: number }>
}

export default function PortalDocumentPage() {
  const { id } = useParams<{ id: string }>()
  const [doc, setDoc] = useState<DocData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/portal/documents/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setDoc(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>Cargando...</div>
  if (error || !doc) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'system-ui', color: '#ef4444' }}>Error: {error || 'Documento no encontrado'}</div>

  const brand = doc.company?.brand_color || '#f97316'
  const cur = doc.currency === 'EUR' ? '€' : doc.currency === 'USD' ? 'US$' : '$'
  const items = doc.items || doc.metadata?.lines || []
  const typeLabels: Record<string, string> = { cotizacion: 'Cotización', pedido: 'Pedido', albaran: 'Nota de Entrega', factura: 'Factura', nota_credito: 'Nota de Crédito' }
  const label = typeLabels[doc.type || ''] || (doc.type || '').toUpperCase()

  const statusColors: Record<string, string> = { draft: '#6b7280', sent: '#3b82f6', accepted: '#10b981', open: '#f59e0b', shipped: '#8b5cf6', delivered: '#10b981', emitida: '#3b82f6', cobrada: '#10b981' }

  // Tracking URL
  let trackUrl: string | null = doc.shipping_tracking_url || null
  if (!trackUrl && doc.shipping_carrier && doc.shipping_tracking_number) {
    const c = doc.shipping_carrier.toLowerCase()
    const n = doc.shipping_tracking_number
    if (c.includes('dhl')) trackUrl = `https://www.dhl.com/ar-es/home/rastreo.html?tracking-id=${n}`
    else if (c.includes('ups')) trackUrl = `https://www.ups.com/track?tracknum=${n}`
    else if (c.includes('fedex')) trackUrl = `https://www.fedex.com/fedextrack/?trknbr=${n}`
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ background: brand, color: '#fff', padding: '20px 24px', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 14, opacity: 0.9 }}>{doc.system_code}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{doc.company?.trade_name || doc.company?.name}</div>
              {doc.company?.legal_name && <div style={{ fontSize: 12, opacity: 0.8 }}>{doc.company.legal_name}</div>}
            </div>
          </div>
        </div>

        {/* Status */}
        <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#374151' }}>Estado:</span>
          <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: (statusColors[doc.status || ''] || '#6b7280') + '20', color: statusColors[doc.status || ''] || '#6b7280' }}>
            {doc.status?.toUpperCase()}
          </span>
        </div>

        {/* Client */}
        <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase' as const, marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{doc.client?.legal_name || doc.client?.name || '—'}</div>
        </div>

        {/* Tracking (if albaran) */}
        {doc.shipping_carrier && (
          <div style={{ background: '#f0f0ff', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase' as const, marginBottom: 8 }}>Información de envío</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div><span style={{ fontSize: 12, color: '#374151' }}>Transportista:</span><br /><strong>{doc.shipping_carrier}</strong></div>
              {doc.shipping_tracking_number && (
                <div>
                  <span style={{ fontSize: 12, color: '#374151' }}>Tracking:</span><br />
                  {trackUrl
                    ? <a href={trackUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6', fontWeight: 600, textDecoration: 'underline' }}>{doc.shipping_tracking_number}</a>
                    : <strong>{doc.shipping_tracking_number}</strong>
                  }
                </div>
              )}
            </div>
            {trackUrl && (
              <a href={trackUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 12, padding: '8px 20px', background: '#8b5cf6', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                📦 Rastrear envío →
              </a>
            )}
          </div>
        )}

        {/* Items */}
        <div style={{ background: '#fff', padding: '16px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left' as const, padding: 8, fontSize: 11, color: '#4b5563' }}>Descripción</th>
                <th style={{ textAlign: 'right' as const, padding: 8, fontSize: 11, color: '#4b5563' }}>Cant.</th>
                <th style={{ textAlign: 'right' as const, padding: 8, fontSize: 11, color: '#4b5563' }}>Precio</th>
                <th style={{ textAlign: 'right' as const, padding: 8, fontSize: 11, color: '#4b5563' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontSize: 13, color: '#111827' }}>{it.description || it['item-name'] || it.name}</td>
                  <td style={{ padding: 8, fontSize: 13, textAlign: 'right' as const }}>{it.quantity || it.units}</td>
                  <td style={{ padding: 8, fontSize: 13, textAlign: 'right' as const, color: '#111827' }}>{cur}{Number(it.unit_price || it['item-base-price'] || 0).toFixed(2)}</td>
                  <td style={{ padding: 8, fontSize: 13, textAlign: 'right' as const, fontWeight: 600 }}>{cur}{Number(it.subtotal || it['total-amount'] || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right' as const, marginTop: 16, padding: '12px 0', borderTop: '2px solid #e5e7eb' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: brand }}>{cur}{Number(doc.total || 0).toFixed(2)}</div>
            <div style={{ fontSize: 11, color: '#4b5563' }}>Total {doc.currency}</div>
          </div>
        </div>

        {/* Notes */}
        {doc.notes && (
          <div style={{ background: '#fef3c7', padding: '12px 24px', fontSize: 13, color: '#1f2937', borderTop: '1px solid #e5e7eb', borderLeft: '3px solid #f59e0b' }}>{doc.notes}</div>
        )}

        {/* Footer */}
        <div style={{ padding: '16px 24px', textAlign: 'center' as const, fontSize: 11, color: '#4b5563' }}>
          {doc.company?.phone && <span>📞 {doc.company.phone}</span>}
          {doc.company?.email_main && <span> · ✉ {doc.company.email_main}</span>}
          {doc.company?.website && <span> · 🌐 {doc.company.website}</span>}
          <div style={{ marginTop: 8 }}>Documento generado por Mocciaro Soft ERP</div>
        </div>
      </div>
    </div>
  )
}
