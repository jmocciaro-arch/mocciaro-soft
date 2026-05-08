'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { InvoicePDFUploader } from './invoice-pdf-uploader'
import { InvoiceConfirmModal } from './invoice-confirm-modal'
import { TangoConfigModal } from './tango-config-modal'
import type {
  InvoiceMethod,
  InvoiceProvider,
  ExtractedInvoiceData,
} from '@/lib/invoicing/invoice-types'

interface TangoItem {
  sku?: string
  description: string
  quantity: number
  unit_price: number
  discount_pct?: number
  iva_pct?: number
}

export type EmitDocType = 'factura' | 'nota_credito' | 'nota_debito'

interface Props {
  open: boolean
  onClose: () => void
  /** Documento asociado (pedido / albarán) del que se va a generar la factura */
  sourceDocId?: string
  /** Cliente de la factura */
  clientId?: string
  /** Items prearmados para facturar directo vía API Tango */
  items?: TangoItem[]
  /** Observación opcional */
  observacion?: string
  /** Tipo de documento a emitir (default 'factura') */
  docType?: EmitDocType
  /** Si es NC vinculada, el MovimientoId Tango de la factura original */
  movimientoReferenciaId?: number
  onInvoiceSaved?: (invoiceDocId: string) => void
}

/**
 * Modal que:
 *  1) Lee la empresa activa y sus providers configurados
 *  2) Muestra las opciones válidas (Tango API / Manual / Externa)
 *  3) Dirige al flujo correspondiente
 */
export function InvoiceMethodSelector({
  open, onClose, sourceDocId, clientId, items, observacion,
  docType = 'factura', movimientoReferenciaId, onInvoiceSaved,
}: Props) {
  const { activeCompany } = useCompanyContext()
  const supabase = createClient()
  const [providers, setProviders] = useState<InvoiceProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [chosen, setChosen] = useState<InvoiceMethod | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [tangoConfigured, setTangoConfigured] = useState(false)
  const [emitting, setEmitting] = useState(false)
  const [emitMsg, setEmitMsg] = useState<string>('')

  // Flujo Manual
  const [pendingData, setPendingData] = useState<ExtractedInvoiceData | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const loadProviders = async () => {
    if (!activeCompany?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('tt_invoice_providers')
      .select('*')
      .eq('company_id', activeCompany.id)
      .eq('is_active', true)
    setProviders((data as unknown as InvoiceProvider[]) || [])

    // ¿Tango configurado?
    const resp = await fetch(`/api/invoices/tango/config?companyId=${activeCompany.id}`)
    const j = await resp.json()
    setTangoConfigured(Boolean(j.configured))
    setLoading(false)
  }

  useEffect(() => {
    if (open) void loadProviders()

  }, [open, activeCompany?.id])

  const isAR = activeCompany?.country === 'AR' || activeCompany?.country === 'Argentina'

  async function handleParsed(data: ExtractedInvoiceData, file: File) {
    setPendingData(data)
    setPendingFile(file)
    setConfirmOpen(true)
  }

  async function handleConfirm(edited: ExtractedInvoiceData) {
    if (!pendingFile || !activeCompany?.id) return
    try {
      const ts = Date.now()
      const path = `${activeCompany.id}/${ts}_${pendingFile.name.replace(/[^\w.-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('invoices')
        .upload(path, pendingFile, { contentType: 'application/pdf', upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('invoices').getPublicUrl(path)
      const pdfUrl = pub.publicUrl

      const manualProvider = providers.find((p) => p.provider_type === 'manual_upload')
      const systemCode = `FAC-${ts}-${Math.floor(Math.random() * 1000)}`
      const { data: doc, error: docErr } = await supabase
        .from('tt_documents')
        .insert({
          type: 'factura',
          system_code: systemCode,
          legal_number: edited.numero_completo || edited.numero,
          invoice_method: 'manual_upload',
          provider_id: manualProvider?.id ?? null,
          company_id: activeCompany.id,
          client_id: clientId,
          original_pdf_url: pdfUrl,
          preview_pdf_url: pdfUrl,
          extracted_data: edited,
          invoice_number: edited.numero_completo || edited.numero,
          invoice_date: edited.fecha,
          invoice_total: edited.total,
          invoice_currency: edited.moneda || 'ARS',
          currency: edited.moneda || 'ARS',
          total: edited.total ?? 0,
          cae: edited.cae,
          cae_expires: edited.cae_vto,
          status: 'emitida',
        })
        .select('id')
        .single()
      if (docErr) throw docErr

      if (sourceDocId) {
        await supabase.from('tt_document_relations').insert({
          parent_id: sourceDocId,
          child_id: doc.id,
          relation_type: 'factura',
        })
      }

      setConfirmOpen(false)
      onInvoiceSaved?.(doc.id as string)
      onClose()
    } catch (err) {
      alert('Error guardando la factura: ' + (err as Error).message)
    }
  }

  async function handleTangoEmit(letra: 'A' | 'B' | 'C') {
    if (!activeCompany?.id) return
    if (!items?.length) {
      alert('No hay items para facturar. Pasá `items` al InvoiceMethodSelector.')
      return
    }
    setEmitting(true)
    setEmitMsg('Emitiendo factura en Tango...')
    try {
      const res = await fetch('/api/invoices/tango/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: activeCompany.id,
          sourceDocId,
          clientId,
          letra,
          items,
          observacion,
          autorizar: true,
          docType,
          movimientoReferenciaId,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Error emitiendo')
      setEmitMsg(`✓ Factura ${j.cae ? 'autorizada' : 'emitida'} (ID ${j.movimientoId}${j.cae ? ', CAE ' + j.cae : ''})`)
      onInvoiceSaved?.(j.documentId)
      setTimeout(() => { onClose() }, 900)
    } catch (err) {
      setEmitMsg('✗ ' + (err as Error).message)
    } finally {
      setEmitting(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={open && !confirmOpen && !configOpen}
        onClose={onClose}
        title={
          docType === 'nota_credito' ? 'Emitir Nota de Crédito'
          : docType === 'nota_debito' ? 'Emitir Nota de Débito'
          : 'Emitir factura'
        }
        size="md"
      >
        <div className="space-y-3">
          <div className="text-sm opacity-70">
            Empresa activa:{' '}
            <strong>
              {(activeCompany as any)?.trade_name || activeCompany?.name}
              {activeCompany?.country ? ` (${activeCompany.country})` : ''}
            </strong>
            {(activeCompany as any)?.legal_name && (activeCompany as any).legal_name !== activeCompany?.name && (
              <div className="text-xs opacity-60">
                Razón social: <strong>{(activeCompany as any).legal_name}</strong>
                {(activeCompany as any).tax_id && <span> · {(activeCompany as any).tax_id}</span>}
              </div>
            )}
            {(activeCompany as any)?.code_prefix && (
              <div className="text-xs opacity-60">Prefijo docs: <strong>{(activeCompany as any).code_prefix}</strong></div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-6 opacity-60">Cargando opciones...</div>
          ) : !chosen ? (
            <div className="grid gap-2">
              {isAR && (
                <MethodCard
                  icon={tangoConfigured ? '🟢' : '⚙'}
                  title="API Tango Factura"
                  subtitle={
                    tangoConfigured
                      ? 'Emisión automática con CAE. Items se facturan directo.'
                      : 'Pendiente configurar credenciales — click para setear'
                  }
                  onClick={() => {
                    if (tangoConfigured) setChosen('tango_api')
                    else setConfigOpen(true)
                  }}
                />
              )}
              {isAR && (
                <MethodCard
                  icon="📄"
                  title="Upload manual PDF"
                  subtitle="Facturá en otro sistema, subí el PDF y la IA extrae los datos"
                  onClick={() => setChosen('manual_upload')}
                />
              )}
              {!isAR && (
                <MethodCard
                  icon="🌍"
                  title="Facturación externa"
                  subtitle="Subí el PDF emitido por tu sistema fiscal (España/USA)"
                  onClick={() => setChosen('manual_upload')}
                />
              )}
              {isAR && tangoConfigured && (
                <button
                  type="button"
                  className="text-xs underline opacity-60 text-left px-1"
                  onClick={() => setConfigOpen(true)}
                >
                  Editar credenciales Tango →
                </button>
              )}
            </div>
          ) : chosen === 'manual_upload' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <strong>Subir PDF de factura</strong>
                <button
                  type="button"
                  className="text-xs underline opacity-60"
                  onClick={() => setChosen(null)}
                >
                  ← Volver
                </button>
              </div>
              <InvoicePDFUploader
                onParsed={handleParsed}
                onError={(m) => alert(m)}
              />
            </div>
          ) : chosen === 'tango_api' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <strong>Emitir con API Tango</strong>
                <button
                  type="button"
                  className="text-xs underline opacity-60"
                  onClick={() => setChosen(null)}
                >
                  ← Volver
                </button>
              </div>

              {!items?.length ? (
                <div
                  className="p-3 rounded-md text-xs"
                  style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}
                >
                  ⚠ No se recibieron items para facturar. El botón debe llamarse desde el detalle de un pedido/albarán.
                </div>
              ) : (
                <>
                  <div className="text-xs opacity-70">
                    Se emitirán <strong>{items.length}</strong> items por un total estimado de $
                    {items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0).toFixed(2)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => handleTangoEmit('A')} disabled={emitting}>Factura A</Button>
                    <Button onClick={() => handleTangoEmit('B')} disabled={emitting}>Factura B</Button>
                    <Button onClick={() => handleTangoEmit('C')} disabled={emitting}>Factura C</Button>
                  </div>
                </>
              )}

              {emitMsg && (
                <div
                  className="text-xs p-2 rounded-md"
                  style={{
                    background: emitMsg.startsWith('✓')
                      ? 'rgba(16,185,129,0.1)'
                      : emitMsg.startsWith('✗')
                      ? 'rgba(239,68,68,0.1)'
                      : 'rgba(249,115,22,0.1)',
                  }}
                >
                  {emitMsg}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </Modal>

      {pendingData && (
        <InvoiceConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          data={pendingData}
          onConfirm={handleConfirm}
        />
      )}

      {activeCompany?.id && (
        <TangoConfigModal
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          companyId={activeCompany.id}
          onSaved={() => { void loadProviders() }}
        />
      )}
    </>
  )
}

function MethodCard({
  icon, title, subtitle, onClick, disabled,
}: { icon: string; title: string; subtitle: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left p-3 rounded-lg border transition-colors hover:bg-[#1E2330] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ borderColor: 'var(--sat-br, #2A3040)', background: '#151821' }}
    >
      <div className="flex gap-3 items-start">
        <div className="text-2xl">{icon}</div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs opacity-60">{subtitle}</div>
        </div>
      </div>
    </button>
  )
}
