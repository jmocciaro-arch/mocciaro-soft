'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { useCompanyContext } from '@/lib/company-context'
import { DOC_TYPES, COUNTERPARTY_TYPES, DOC_TYPE_DIRECTION, type DocType } from '@/lib/schemas/documents'
import { createDocument, type CreateDocumentInput } from '@/lib/documents/client'
import { docTypeLabel } from '@/components/documents/status-badge'

// Tipos razonables para crear manualmente desde el UI. Los de sistema
// (internal/receipt) se excluyen del wizard: nacen por derivación.
const CREATABLE_TYPES: DocType[] = ['quote', 'sales_order', 'purchase_order', 'invoice', 'proforma', 'delivery_note']

const TYPE_OPTIONS = CREATABLE_TYPES.map((t) => ({ value: t, label: docTypeLabel(t) }))
const COUNTERPARTY_TYPE_OPTIONS = [
  { value: '', label: '— Sin definir —' },
  ...COUNTERPARTY_TYPES.map((t) => ({ value: t, label: t })),
]

// Moneda default por país — conservador; el usuario puede cambiar.
const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, string> = {
  AR: 'ARS', UY: 'UYU', ES: 'EUR', US: 'USD', CL: 'CLP', BR: 'BRL', MX: 'MXN',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function NewDocumentPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const { activeCompanyId, companies } = useCompanyContext()

  const [companyId, setCompanyId] = useState<string>(activeCompanyId ?? '')
  const [docType, setDocType] = useState<DocType>('quote')
  const [docDate, setDocDate] = useState(todayISO())

  const [counterpartyType, setCounterpartyType] = useState<string>('customer')
  const [counterpartyName, setCounterpartyName] = useState('')
  const [counterpartyTaxId, setCounterpartyTaxId] = useState('')
  const [counterpartyEmail, setCounterpartyEmail] = useState('')

  const [currency, setCurrency] = useState<string>(() => {
    const c = companies.find((x) => x.id === (activeCompanyId ?? ''))
    return c?.currency ?? 'ARS'
  })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Cuando el usuario cambia empresa, tentamos moneda por país.
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: `${c.flag} ${c.name} · ${c.currency}` })),
    [companies]
  )

  const onCompanyChange = (id: string) => {
    setCompanyId(id)
    const c = companies.find((x) => x.id === id)
    if (c) setCurrency(c.currency || DEFAULT_CURRENCY_BY_COUNTRY[c.country] || 'ARS')
  }

  const direction = DOC_TYPE_DIRECTION[docType]
  // Sugerir tipo de contraparte según dirección del documento. Aviso visual solo.
  const suggestedCounterpartyType =
    direction === 'sales' ? 'customer' :
    direction === 'purchase' ? 'supplier' :
    'internal'

  const canSubmit =
    Boolean(companyId) &&
    Boolean(docType) &&
    Boolean(currency) &&
    counterpartyName.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) {
      addToast({ type: 'warning', title: 'Completá los campos requeridos' })
      return
    }
    setSubmitting(true)
    try {
      const payload: CreateDocumentInput = {
        company_id: companyId,
        doc_type: docType,
        doc_date: docDate,
        counterparty_type: (counterpartyType || undefined) as CreateDocumentInput['counterparty_type'],
        counterparty_name: counterpartyName.trim(),
        counterparty_tax_id: counterpartyTaxId.trim() || undefined,
        counterparty_email: counterpartyEmail.trim() || undefined,
        currency_code: currency.toUpperCase(),
        notes: notes.trim() || undefined,
      }
      const res = await createDocument(payload)
      addToast({ type: 'success', title: 'Borrador creado' })
      router.push(`/documents/${res.data.id}`)
    } catch (e) {
      addToast({ type: 'error', title: 'Error creando documento', message: e instanceof Error ? e.message : '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-xs text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al listado
        </Link>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-orange-400" />
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Nuevo documento</h1>
        </div>
        <p className="text-sm text-[#9CA3AF] mt-1">
          Creamos un borrador. Vas a poder agregar líneas y emitirlo desde el editor.
        </p>
      </div>

      {/* Paso 1: empresa + tipo */}
      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
          1 · Empresa y tipo
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Empresa"
            value={companyId}
            onChange={(e) => onCompanyChange(e.target.value)}
            options={companyOptions.length > 0 ? companyOptions : [{ value: '', label: 'Sin empresas disponibles' }]}
          />
          <Select
            label="Tipo de documento"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            options={TYPE_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Input
            type="date"
            label="Fecha"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
          />
          <Input
            label="Moneda"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </div>
        <p className="text-[11px] text-[#6B7280] mt-3">
          Dirección inferida: <span className="text-[#D1D5DB]">{direction}</span>
          {' · '}
          Contraparte sugerida: <span className="text-[#D1D5DB]">{suggestedCounterpartyType}</span>
        </p>
      </Card>

      {/* Paso 2: contraparte */}
      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
          2 · Contraparte
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            label="Tipo"
            value={counterpartyType}
            onChange={(e) => setCounterpartyType(e.target.value)}
            options={COUNTERPARTY_TYPE_OPTIONS}
          />
          <div className="md:col-span-2">
            <Input
              label="Nombre *"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="Razón social o nombre comercial"
              autoFocus
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Input
            label="CUIT / Tax ID"
            value={counterpartyTaxId}
            onChange={(e) => setCounterpartyTaxId(e.target.value)}
            placeholder="Opcional"
          />
          <Input
            type="email"
            label="Email"
            value={counterpartyEmail}
            onChange={(e) => setCounterpartyEmail(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </Card>

      {/* Paso 3: notas */}
      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] mb-3">
          3 · Notas (opcional)
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notas visibles en el PDF — condiciones, observaciones…"
          className="w-full rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        />
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Link href="/documents">
          <Button variant="ghost">Cancelar</Button>
        </Link>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
        >
          Crear borrador
        </Button>
      </div>
    </div>
  )
}
