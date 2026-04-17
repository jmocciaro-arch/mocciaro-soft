'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileText, Download, Eye, Loader2, AlertCircle, FileCheck, Package, Receipt } from 'lucide-react'

interface ClientInfo {
  id: string
  name: string
  email: string
  company_name: string | null
}

interface Document {
  id: string
  code: string
  status: string
  total_amount?: number
  currency?: string
  created_at: string
  pdf_url?: string | null
  due_date?: string | null
}

interface PortalData {
  client: ClientInfo
  documents: {
    quotes: Document[]
    orders: Document[]
    invoices: Document[]
    deliveryNotes: Document[]
  }
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  open: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  partial: 'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  open: 'Abierto',
  completed: 'Completado',
  pending: 'Pendiente',
  paid: 'Pagado',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
  partial: 'Parcial',
}

function formatCurrency(amount?: number, currency = 'EUR') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function DocumentTable({
  title,
  icon: Icon,
  docs,
  showAmount = true,
  showDueDate = false,
}: {
  title: string
  icon: typeof FileText
  docs: Document[]
  showAmount?: boolean
  showDueDate?: boolean
}) {
  if (docs.length === 0) return null

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={20} className="text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{docs.length}</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              {showAmount && <th className="text-right px-4 py-3 font-medium text-gray-600">Importe</th>}
              {showDueDate && <th className="text-left px-4 py-3 font-medium text-gray-600">Vencimiento</th>}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {docs.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{doc.code}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                </td>
                {showAmount && (
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(doc.total_amount, doc.currency)}
                  </td>
                )}
                {showDueDate && (
                  <td className="px-4 py-3 text-gray-600">
                    {doc.due_date ? formatDate(doc.due_date) : '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-500">{formatDate(doc.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {doc.pdf_url && (
                      <>
                        <a
                          href={doc.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                        >
                          <Eye size={12} />
                          Ver
                        </a>
                        <a
                          href={doc.pdf_url}
                          download
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                          style={{ backgroundColor: '#f97316' }}
                        >
                          <Download size={12} />
                          PDF
                        </a>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ClientPortalPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) {
          setError(res.error)
        } else {
          setData(res as PortalData)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Error al cargar el portal')
        setLoading(false)
      })
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Acceso no disponible</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  const { client, documents } = data!
  const totalDocs =
    documents.quotes.length +
    documents.orders.length +
    documents.invoices.length +
    documents.deliveryNotes.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Portal del cliente</h1>
              <p className="text-sm text-gray-500 mt-0.5">Powered by Mocciaro Soft</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900">{client.name}</p>
              {client.company_name && (
                <p className="text-sm text-gray-500">{client.company_name}</p>
              )}
              <p className="text-xs text-gray-400">{client.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Cotizaciones', count: documents.quotes.length, icon: FileText, color: 'text-blue-500 bg-blue-50' },
            { label: 'Pedidos', count: documents.orders.length, icon: Package, color: 'text-purple-500 bg-purple-50' },
            { label: 'Facturas', count: documents.invoices.length, icon: Receipt, color: 'text-orange-500 bg-orange-50' },
            { label: 'Albaranes', count: documents.deliveryNotes.length, icon: FileCheck, color: 'text-green-500 bg-green-50' },
          ].map(({ label, count, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl p-4 border border-gray-200">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {totalDocs === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <FileText size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay documentos disponibles todavía</p>
          </div>
        ) : (
          <>
            <DocumentTable
              title="Cotizaciones"
              icon={FileText}
              docs={documents.quotes}
              showAmount
            />
            <DocumentTable
              title="Pedidos"
              icon={Package}
              docs={documents.orders}
              showAmount
            />
            <DocumentTable
              title="Facturas"
              icon={Receipt}
              docs={documents.invoices}
              showAmount
              showDueDate
            />
            <DocumentTable
              title="Albaranes"
              icon={FileCheck}
              docs={documents.deliveryNotes}
              showAmount={false}
            />
          </>
        )}
      </div>

      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        Portal seguro · Mocciaro Soft ERP
      </footer>
    </div>
  )
}
