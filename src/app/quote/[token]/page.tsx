'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { SignaturePad } from '@/components/ui/signature-pad'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface TokenInfo {
  id: string
  accepted_at: string | null
  accepted_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  expires_at: string | null
}

interface DocumentInfo {
  id: string
  type: string
  system_code: string | null
  display_ref: string | null
  status: string
  invoice_date: string | null
  valid_until: string | null
  currency: string | null
  subtotal: number | null
  tax_amount: number | null
  tax_rate: number | null
  total: number | null
  notes: string | null
  incoterm: string | null
  payment_terms: string | null
}

interface CompanyInfo {
  name: string
  trade_name: string | null
  legal_name: string | null
  tax_id: string | null
  logo_url: string | null
  brand_color: string | null
  secondary_color: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email_main: string | null
  website: string | null
  footer_note: string | null
  bank_details: string | null
}

interface ClientInfo {
  id: string
  name: string
  legal_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
}

interface Item {
  'item-reference'?: string
  sku?: string
  'item-name'?: string
  name?: string
  description?: string
  'item-description'?: string
  units?: number
  quantity?: number
  'item-base-price'?: number
  unit_price?: number
  'total-amount'?: number
  subtotal?: number
}

interface Comment {
  id: string
  author_name: string
  author_type: string
  message: string
  created_at: string
}

interface HistoryDoc {
  id: string
  type: string
  system_code: string | null
  display_ref: string | null
  status: string
  total: number | null
  currency: string | null
  created_at: string
}

interface PortalData {
  token: TokenInfo
  document: DocumentInfo
  company: CompanyInfo
  client: ClientInfo | null
  items: Item[]
  comments: Comment[]
  history: HistoryDoc[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

function fmtAmt(n: number | null | undefined, currency: string | null): string {
  const sym = currency === 'EUR' ? '€' : currency === 'ARS' ? '$' : '$'
  return `${sym}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const TYPE_LABELS: Record<string, string> = {
  cotizacion: 'Cotización', factura: 'Factura', pedido: 'Pedido',
  albaran: 'Albarán', remito: 'Remito', nota_credito: 'Nota de Crédito',
  orden_compra: 'Orden de Compra', factura_compra: 'Factura de Compra',
}

// Status badge (inline styles, light theme)
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    borrador:  { bg: '#f3f4f6', color: '#6b7280', label: 'Borrador' },
    draft:     { bg: '#f3f4f6', color: '#6b7280', label: 'Borrador' },
    enviada:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Enviada' },
    sent:      { bg: '#dbeafe', color: '#1d4ed8', label: 'Enviada' },
    aceptada:  { bg: '#dcfce7', color: '#15803d', label: 'Aceptada' },
    accepted:  { bg: '#dcfce7', color: '#15803d', label: 'Aceptada' },
    rechazada: { bg: '#fee2e2', color: '#dc2626', label: 'Rechazada' },
    rejected:  { bg: '#fee2e2', color: '#dc2626', label: 'Rechazada' },
    expirada:  { bg: '#fef3c7', color: '#b45309', label: 'Vencida' },
    expired:   { bg: '#fef3c7', color: '#b45309', label: 'Vencida' },
    facturada: { bg: '#f3e8ff', color: '#7e22ce', label: 'Facturada' },
    invoiced:  { bg: '#f3e8ff', color: '#7e22ce', label: 'Facturada' },
  }
  const s = styles[status] ?? { bg: '#f3f4f6', color: '#6b7280', label: status }
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg,
      color: s.color,
      borderRadius: '99px',
      padding: '3px 12px',
      fontSize: '12px',
      fontWeight: 600,
    }}>
      {s.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function QuotePortalPage() {
  const params = useParams()
  const token = params?.token as string

  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [panel, setPanel] = useState<'none' | 'accept' | 'reject'>('none')
  const [signerName, setSignerName] = useState('')
  const [signatureB64, setSignatureB64] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [commenterName, setCommenterName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])

  const loadData = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/quote/${token}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error || 'No se pudo cargar la cotización')
        return
      }
      const json = await res.json() as PortalData
      setData(json)
      setComments(json.comments ?? [])
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  async function doAction(action: 'accept' | 'reject' | 'comment', extra: Record<string, string | null | undefined> = {}) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/quote/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await res.json() as { ok?: boolean; error?: string; comment?: Comment }
      if (!res.ok || !j.ok) {
        setSubmitError(j.error || 'Error desconocido')
        return
      }

      if (action === 'accept') {
        setSubmitMsg('¡Cotización aceptada con éxito!')
        setPanel('none')
        await loadData()
      } else if (action === 'reject') {
        setSubmitMsg('Cotización rechazada.')
        setPanel('none')
        await loadData()
      } else if (action === 'comment' && j.comment) {
        setComments(prev => [...prev, j.comment!])
        setCommentText('')
        setSubmitMsg(null)
      }
    } catch {
      setSubmitError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p>Cargando cotización...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '40px', textAlign: 'center', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
          <h2 style={{ color: '#111827', marginBottom: '8px' }}>Enlace no disponible</h2>
          <p style={{ color: '#6b7280' }}>{error || 'El enlace que buscás no existe o ha vencido.'}</p>
        </div>
      </div>
    )
  }

  const { document: doc, company, client, items, history, token: tk } = data
  const brand = company.brand_color || '#f97316'
  const companyName = company.trade_name || company.name
  const docCode = doc.display_ref || doc.system_code || '—'
  const currency = doc.currency || 'EUR'
  const isResolved = !!(tk.accepted_at || tk.rejected_at)

  const footerParts = [
    company.legal_name || company.name,
    company.tax_id ? `CIF/NIF: ${company.tax_id}` : '',
    company.address ? `${company.address}${company.city ? ', ' + company.city : ''}` : '',
    company.phone ? `Tel: ${company.phone}` : '',
    company.email_main ?? '',
    company.website ?? '',
  ].filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f5', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827' }}>
      {/* ── HEADER ── */}
      <header style={{ background: brand, padding: '20px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {company.logo_url
            ? <img src={company.logo_url} alt={companyName} style={{ maxHeight: '48px', maxWidth: '160px', objectFit: 'contain' }} />
            : <span style={{ fontSize: '22px', fontWeight: 800, color: '#fff' }}>{companyName}</span>
          }
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portal de Cotizaciones</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>{companyName}</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ── STATUS BANNER ── */}
        {submitMsg && (
          <div style={{ background: '#dcfce7', color: '#15803d', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px', fontWeight: 600 }}>
            {submitMsg}
          </div>
        )}
        {submitError && (
          <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
            {submitError}
          </div>
        )}

        {/* ── DOCUMENT CARD ── */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '20px', overflow: 'hidden' }}>
          {/* Title row */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {TYPE_LABELS[doc.type] || 'Documento'}
              </div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>{docCode}</h1>
            </div>
            <StatusBadge status={tk.accepted_at ? 'aceptada' : tk.rejected_at ? 'rechazada' : doc.status} />
          </div>

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1px', background: '#f0f0f0' }}>
            {[
              { label: 'Fecha', value: fmtDate(doc.invoice_date) },
              doc.valid_until ? { label: 'Válida hasta', value: fmtDate(doc.valid_until) } : null,
              doc.incoterm ? { label: 'Incoterm', value: doc.incoterm } : null,
              doc.payment_terms ? { label: 'Cond. pago', value: doc.payment_terms } : null,
            ].filter(Boolean).map((m, i) => (
              <div key={i} style={{ background: '#fff', padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>{(m as {label: string; value: string}).label}</div>
                <div style={{ fontWeight: 600 }}>{(m as {label: string; value: string}).value}</div>
              </div>
            ))}
          </div>

          {/* Client info */}
          {client && (
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>Cliente</div>
              <div style={{ fontWeight: 600 }}>{client.legal_name || client.name}</div>
              {client.tax_id && <div style={{ fontSize: '13px', color: '#6b7280' }}>CIF/CUIT: {client.tax_id}</div>}
              {client.email && <div style={{ fontSize: '13px', color: '#6b7280' }}>{client.email}</div>}
              {client.address && <div style={{ fontSize: '13px', color: '#6b7280' }}>{client.address}{client.city ? ', ' + client.city : ''}</div>}
            </div>
          )}
        </div>

        {/* ── ITEMS TABLE ── */}
        {items.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '20px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', fontWeight: 700 }}>Ítems</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Descripción</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cant.</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Precio</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const name = it['item-name'] || it.name || it.description || 'Item'
                    const sku = it['item-reference'] || it.sku
                    const qty = it.units ?? it.quantity ?? 1
                    const price = it['item-base-price'] ?? it.unit_price ?? 0
                    const sub = it['total-amount'] ?? it.subtotal ?? (qty * price)
                    return (
                      <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {sku && <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>{sku}</div>}
                          <div style={{ fontWeight: 500 }}>{name}</div>
                          {it['item-description'] && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{it['item-description']}</div>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>{qty}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtAmt(price, currency)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtAmt(sub, currency)}</td>
                      </tr>
                    )
                  })}
                  {/* Totals */}
                  {doc.tax_amount && Number(doc.tax_amount) > 0 && (
                    <tr style={{ borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
                      <td colSpan={3} style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7280', fontSize: '13px' }}>Subtotal</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtAmt(doc.subtotal, currency)}</td>
                    </tr>
                  )}
                  {doc.tax_amount && Number(doc.tax_amount) > 0 && (
                    <tr style={{ background: '#fafafa' }}>
                      <td colSpan={3} style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7280', fontSize: '13px' }}>IVA ({doc.tax_rate ?? 21}%)</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtAmt(doc.tax_amount, currency)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                    <td colSpan={3} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontSize: '15px' }}>TOTAL</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontSize: '18px', color: brand }}>{fmtAmt(doc.total, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NOTES ── */}
        {doc.notes && (
          <div style={{ background: '#fffbf0', border: `1px solid ${brand}40`, borderRadius: '8px', padding: '16px', marginBottom: '20px', fontSize: '14px', color: '#374151' }}>
            <strong>Notas:</strong> {doc.notes}
          </div>
        )}

        {/* ── ACCEPTANCE INFO (if already resolved) ── */}
        {tk.accepted_at && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: '16px', marginBottom: '6px' }}>Cotización aceptada</div>
            <div style={{ color: '#166534', fontSize: '14px' }}>
              Aceptada por <strong>{tk.accepted_by}</strong> el {fmtDateTime(tk.accepted_at)}
            </div>
          </div>
        )}
        {tk.rejected_at && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#dc2626', fontSize: '16px', marginBottom: '6px' }}>Cotización rechazada</div>
            {tk.rejection_reason && <div style={{ color: '#991b1b', fontSize: '14px' }}>Motivo: {tk.rejection_reason}</div>}
          </div>
        )}

        {/* ── ACTION BUTTONS ── */}
        {!isResolved && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setPanel(panel === 'accept' ? 'none' : 'accept')}
              style={{
                flex: 1, minWidth: '160px', padding: '14px 20px',
                background: '#16a34a', color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Aceptar cotización
            </button>
            <button
              onClick={() => setPanel(panel === 'reject' ? 'none' : 'reject')}
              style={{
                flex: 1, minWidth: '160px', padding: '14px 20px',
                background: '#fff', color: '#dc2626', border: '2px solid #dc2626',
                borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Rechazar
            </button>
          </div>
        )}

        {/* ── ACCEPT PANEL ── */}
        {panel === 'accept' && !isResolved && (
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Confirmar aceptación</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Su nombre completo *
              </label>
              <input
                type="text"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Nombre y apellido"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Firma digital (opcional)
              </label>
              <SignaturePad
                onSign={(b64) => setSignatureB64(b64)}
                width={520}
                height={160}
              />
              {signatureB64 && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#dcfce7', borderRadius: '6px', fontSize: '13px', color: '#15803d' }}>
                  Firma guardada correctamente
                </div>
              )}
            </div>
            {submitError && (
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px' }}>
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  if (!signerName.trim()) { setSubmitError('Ingresá tu nombre para aceptar'); return }
                  doAction('accept', { name: signerName, signature_base64: signatureB64 ?? undefined })
                }}
                disabled={submitting || !signerName.trim()}
                style={{
                  padding: '12px 24px', background: submitting ? '#86efac' : '#16a34a',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Procesando...' : 'Confirmar aceptación'}
              </button>
              <button
                onClick={() => { setPanel('none'); setSubmitError(null) }}
                style={{ padding: '12px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── REJECT PANEL ── */}
        {panel === 'reject' && !isResolved && (
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#dc2626' }}>Rechazar cotización</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Motivo del rechazo *
              </label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Ej: El precio está fuera de nuestro presupuesto..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
            {submitError && (
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px' }}>
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  if (!rejectionReason.trim()) { setSubmitError('Indicá el motivo del rechazo'); return }
                  doAction('reject', { reason: rejectionReason })
                }}
                disabled={submitting || !rejectionReason.trim()}
                style={{
                  padding: '12px 24px', background: submitting ? '#fca5a5' : '#dc2626',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Procesando...' : 'Confirmar rechazo'}
              </button>
              <button
                onClick={() => { setPanel('none'); setSubmitError(null) }}
                style={{ padding: '12px 20px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── COMMENTS ── */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Consultas y comentarios</h3>

          {/* Comment list */}
          {comments.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 20px' }}>Sin comentarios aún.</p>
          ) : (
            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {comments.map(c => (
                <div key={c.id} style={{
                  padding: '12px 16px',
                  background: c.author_type === 'internal' ? '#f0f9ff' : '#f9fafb',
                  borderRadius: '8px',
                  borderLeft: `3px solid ${c.author_type === 'internal' ? brand : '#d1d5db'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: c.author_type === 'internal' ? brand : '#374151' }}>
                      {c.author_type === 'internal' ? companyName : c.author_name}
                      {c.author_type === 'internal' && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', background: brand + '20', color: brand, padding: '1px 6px', borderRadius: '99px' }}>Empresa</span>
                      )}
                    </span>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{fmtDateTime(c.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.5 }}>{c.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* New comment form */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
            <div style={{ marginBottom: '10px' }}>
              <input
                type="text"
                value={commenterName}
                onChange={e => setCommenterName(e.target.value)}
                placeholder="Su nombre"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '8px', boxSizing: 'border-box',
                }}
              />
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Escriba su consulta o comentario..."
                rows={3}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={() => {
                if (!commentText.trim()) return
                doAction('comment', {
                  message: commentText,
                  author_name: commenterName || 'Cliente',
                })
              }}
              disabled={submitting || !commentText.trim()}
              style={{
                padding: '10px 20px',
                background: commentText.trim() ? brand : '#d1d5db',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontSize: '14px', fontWeight: 600, cursor: commentText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Enviando...' : 'Enviar comentario'}
            </button>
          </div>
        </div>

        {/* ── TRANSACTION HISTORY ── */}
        {history.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Historial de transacciones</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Tipo</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Referencia</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Estado</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Total</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{TYPE_LABELS[h.type] || h.type}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>{h.display_ref || h.system_code || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={h.status} /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtAmt(h.total, h.currency)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{fmtDate(h.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#1f2937', color: '#9ca3af', padding: '24px 20px', textAlign: 'center', fontSize: '13px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ marginBottom: '6px', fontWeight: 600, color: '#e5e7eb' }}>{companyName}</div>
          <div>{footerParts.join(' · ')}</div>
          {company.footer_note && <div style={{ marginTop: '8px', fontSize: '12px' }}>{company.footer_note}</div>}
        </div>
      </footer>
    </div>
  )
}
