// ============================================================================
// /doc/view/[id]?token=...
//
// Página pública (sin login) para que el cliente vea el documento que le
// compartimos. Resuelve el token vía /api/doc/view/[id] y renderiza el HTML
// del doc en un iframe. Botón de descarga llama a /api/documents/[id]/pdf
// pasando el token como query.
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Download, Loader2, Lock, AlertCircle } from 'lucide-react'

interface DocSummary {
  id: string
  doc_type?: string | null
  display_ref?: string | null
  system_code?: string | null
  status?: string | null
  currency?: string | null
  total?: number | null
  created_at?: string | null
  valid_until?: string | null
  client?: { name?: string | null; legal_name?: string | null; email?: string | null } | null
  company?: {
    name?: string | null
    trade_name?: string | null
    legal_name?: string | null
    logo_url?: string | null
    brand_color?: string | null
    secondary_color?: string | null
  } | null
}

interface ViewResponse {
  doc: DocSummary
  html: string | null
  share_link_id: string
}

const TYPE_LABELS: Record<string, string> = {
  cotizacion: 'Cotización',
  pedido: 'Pedido',
  albaran: 'Nota de Entrega',
  factura: 'Factura',
  nota_credito: 'Nota de Crédito',
  coti: 'Cotización',
  delivery_note: 'Nota de Entrega',
}

export default function DocViewPage() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const docId = params.id
  const token = search.get('token') || ''

  const [data, setData] = useState<ViewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requiresPassword, setRequiresPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [downloading, setDownloading] = useState(false)

  const fetchDoc = useCallback(async (pwd?: string) => {
    setLoading(true)
    setError(null)
    try {
      const url = new URL(`/api/doc/view/${docId}`, window.location.origin)
      url.searchParams.set('token', token)
      if (pwd) url.searchParams.set('password', pwd)

      const res = await fetch(url.toString(), { cache: 'no-store' })
      const json = await res.json()

      if (!res.ok) {
        if (json.requires_password) {
          setRequiresPassword(true)
          setError(null)
        } else {
          setError(json.error || 'Error al cargar el documento')
        }
        return
      }

      setData(json as ViewResponse)
      setRequiresPassword(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [docId, token])

  useEffect(() => {
    if (!token) {
      setError('Falta el token en la URL')
      setLoading(false)
      return
    }
    fetchDoc()
  }, [token, fetchDoc])

  const handleDownloadPdf = async () => {
    if (!data?.doc.id) return
    setDownloading(true)
    try {
      // El endpoint /api/documents/[id]/pdf requiere auth — para link público,
      // descargamos como HTML imprimible o un fallback. Por ahora abrimos
      // el HTML en una nueva pestaña con window.print().
      const printWindow = window.open('', '_blank')
      if (printWindow && data.html) {
        printWindow.document.write(data.html)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => printWindow.print(), 500)
      }
    } finally {
      setDownloading(false)
    }
  }

  // ─── Estados ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={40} />
      </div>
    )
  }

  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center">
              <Lock size={28} className="text-orange-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Documento protegido</h1>
            <p className="text-sm text-slate-500 mt-1">Ingresá la contraseña para acceder</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              fetchDoc(password)
            }}
            className="space-y-3"
          >
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Acceder
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle size={28} className="text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No se pudo abrir el documento</h1>
          <p className="text-sm text-slate-500">{error || 'Sin datos'}</p>
        </div>
      </div>
    )
  }

  const { doc, html } = data
  const company = doc.company || {}
  const brandColor = company.brand_color || '#FF6600'
  const companyName = company.trade_name || company.name || company.legal_name || 'Mi empresa'
  const docLabel = TYPE_LABELS[doc.doc_type || ''] || (doc.doc_type ?? 'Documento')
  const docRef = doc.display_ref || doc.system_code || doc.id
  const docFilename = `${docLabel}-${docRef}.pdf`

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ─── Header con branding ─── */}
      <header
        className="bg-white border-b shadow-sm"
        style={{ borderBottomColor: brandColor }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.logo_url}
                alt={companyName}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: brandColor }}
              >
                {companyName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{companyName}</p>
              <p className="text-xs text-slate-500 truncate">
                {docLabel} {docRef}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: brandColor }}
          >
            {downloading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            Descargar PDF
          </button>
        </div>
      </header>

      {/* ─── Documento ─── */}
      <main className="max-w-5xl mx-auto p-4">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          {html ? (
            <iframe
              srcDoc={html}
              className="w-full border-0"
              style={{ minHeight: '85vh' }}
              title={docFilename}
            />
          ) : (
            <div className="p-8 text-center text-slate-500">
              <p>El documento no pudo renderizarse.</p>
            </div>
          )}
        </div>

        <footer className="text-center text-xs text-slate-400 py-6">
          Si tenés alguna consulta sobre este documento, contactá con {companyName}.
        </footer>
      </main>
    </div>
  )
}
