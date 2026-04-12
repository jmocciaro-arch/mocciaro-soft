'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils'
import {
  generateDocumentHTML,
  generateDocumentText,
  generateDocumentExcelXML,
  printDocumentHTML,
  downloadDocument,
} from '@/lib/document-template'
import {
  Mail, MessageCircle, Copy, ExternalLink, Check, X,
  FileText, Globe, Table2, FileEdit, AlignLeft, Link2,
  Eye, Paperclip, Plus, Shield, Clock, BookmarkPlus,
  Send, ChevronDown, ChevronUp, Loader2, Upload,
  CheckCircle, AlertCircle, EyeOff,
} from 'lucide-react'

// ===============================================================
// TYPES
// ===============================================================

interface Recipient {
  email: string
  name: string
  type: 'to' | 'cc' | 'bcc'
}

interface ContactSuggestion {
  email: string
  name: string
}

interface SendRecord {
  id: string
  sent_at: string
  channel: string
  format: string
  recipients: Recipient[]
  subject: string
  delivery_status: string
  first_opened_at: string | null
  open_count: number
  link_clicks: Array<{ at: string; url: string }>
}

type FormatOption = 'pdf' | 'html' | 'excel' | 'word' | 'text' | 'link'
type Language = 'es' | 'en' | 'pt'

interface SendDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  documentType: string
  documentNumber: string
  documentId?: string
  clientName: string
  clientEmail?: string
  clientId?: string
  total: number
  currency: 'EUR' | 'ARS' | 'USD'
  items?: Array<{
    sku: string
    description: string
    quantity: number
    unit_price: number
    discount_pct: number
    subtotal: number
    notes?: string
    is_section?: boolean
    section_label?: string
  }>
  document?: {
    type: string
    display_ref: string
    system_code: string
    status: string
    currency: string
    subtotal: number
    tax_amount: number
    tax_rate: number
    total: number
    notes?: string
    created_at: string
    valid_until?: string
    delivery_date?: string
    incoterm?: string
    payment_terms?: string
    shipping_address?: string
  }
  client?: {
    name: string
    legal_name?: string | null
    tax_id?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    city?: string | null
    country?: string | null
  }
  company?: {
    name: string
    tax_id?: string
    address?: string
    city?: string
    country?: string
    phone?: string
    email?: string
    website?: string
    logo_url?: string
    bank_details?: string
  }
  onSent?: () => void
}

// ===============================================================
// FORMAT CONFIG
// ===============================================================

const FORMAT_OPTIONS: Array<{
  value: FormatOption
  label: string
  icon: typeof FileText
  desc: string
  color: string
}> = [
  { value: 'pdf', label: 'PDF', icon: FileText, desc: 'Documento profesional con diseno', color: '#EF4444' },
  { value: 'html', label: 'HTML', icon: Globe, desc: 'Email con diseno inline', color: '#3B82F6' },
  { value: 'excel', label: 'Excel', icon: Table2, desc: 'Hoja de calculo con datos', color: '#10B981' },
  { value: 'word', label: 'Word', icon: FileEdit, desc: 'Documento editable', color: '#6366F1' },
  { value: 'text', label: 'Texto plano', icon: AlignLeft, desc: 'Solo texto formateado', color: '#6B7280' },
  { value: 'link', label: 'Link compartible', icon: Link2, desc: 'Genera link para el cliente', color: '#FF6600' },
]

const TYPE_LABELS: Record<string, string> = {
  coti: 'Cotizacion',
  pedido: 'Pedido de Venta',
  delivery_note: 'Albaran / Remito',
  factura: 'Factura',
  pap: 'Pedido a Proveedor',
  recepcion: 'Recepcion',
  factura_compra: 'Factura de Compra',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  sent: { label: 'Enviado', color: '#F59E0B', bg: '#F59E0B20' },
  delivered: { label: 'Entregado', color: '#10B981', bg: '#10B98120' },
  opened: { label: 'Abierto', color: '#10B981', bg: '#10B98120' },
  clicked: { label: 'Click', color: '#3B82F6', bg: '#3B82F620' },
  bounced: { label: 'Rebotado', color: '#EF4444', bg: '#EF444420' },
  failed: { label: 'Fallido', color: '#EF4444', bg: '#EF444420' },
}

// ===============================================================
// COMPONENT
// ===============================================================

export function SendDocumentModal({
  isOpen,
  onClose,
  documentType,
  documentNumber,
  documentId,
  clientName,
  clientEmail,
  clientId,
  total,
  currency,
  items,
  document: docData,
  client: clientData,
  company: companyData,
  onSent,
}: SendDocumentModalProps) {
  const supabase = createClient()

  const docLabel = TYPE_LABELS[documentType] || documentType

  // Steps
  const [activeStep, setActiveStep] = useState(0)

  // Step 1: Recipients
  const [toRecipients, setToRecipients] = useState<Recipient[]>([])
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([])
  const [bccRecipients, setBccRecipients] = useState<Recipient[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc'>('to')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)

  // Step 2: Format
  const [selectedFormat, setSelectedFormat] = useState<FormatOption>('pdf')

  // Step 3: Content
  const [subject, setSubject] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [language, setLanguage] = useState<Language>('es')
  const [showPreview, setShowPreview] = useState(false)

  // Step 4: Attachments
  const [extraAttachments, setExtraAttachments] = useState<Array<{ name: string; size: string }>>([])

  // Step 5: Options
  const [trackOpens, setTrackOpens] = useState(true)
  const [linkPassword, setLinkPassword] = useState('')
  const [linkExpiry, setLinkExpiry] = useState('7')

  // Send state
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  // History
  const [sendHistory, setSendHistory] = useState<SendRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      // Pre-fill recipients
      if (clientEmail && toRecipients.length === 0) {
        setToRecipients([{ email: clientEmail, name: clientName, type: 'to' }])
      }
      // Pre-fill subject
      setSubject(`${docLabel} ${documentNumber} — TorqueTools`)
      // Pre-fill message
      setMessageBody(getDefaultMessage(language))
      // Load history
      if (documentId) {
        loadSendHistory()
      }
      // Reset state
      setSent(false)
      setActiveStep(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  function getDefaultMessage(lang: Language): string {
    const msgs: Record<Language, string> = {
      es: `Estimado/a ${clientName},

Le enviamos ${docLabel} ${documentNumber}.

Total: ${formatCurrency(total, currency)}

Quedamos a disposicion para cualquier consulta.

Saludos cordiales,
TorqueTools`,
      en: `Dear ${clientName},

Please find attached ${docLabel} ${documentNumber}.

Total: ${formatCurrency(total, currency)}

Please do not hesitate to contact us should you have any questions.

Best regards,
TorqueTools`,
      pt: `Prezado(a) ${clientName},

Enviamos ${docLabel} ${documentNumber}.

Total: ${formatCurrency(total, currency)}

Ficamos a disposicao para qualquer consulta.

Atenciosamente,
TorqueTools`,
    }
    return msgs[lang] || msgs.es
  }

  // Load send history
  const loadSendHistory = useCallback(async () => {
    if (!documentId) return
    setLoadingHistory(true)
    try {
      const { data } = await supabase
        .from('tt_document_sends')
        .select('*')
        .eq('document_id', documentId)
        .order('sent_at', { ascending: false })
        .limit(20)

      setSendHistory((data || []) as SendRecord[])
    } catch {
      // silent
    } finally {
      setLoadingHistory(false)
    }
  }, [documentId, supabase])

  // Contact autocomplete
  useEffect(() => {
    if (!emailInput.trim() || emailInput.length < 2) {
      setContactSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      // Search client contacts
      if (clientId) {
        const { data } = await supabase
          .from('tt_client_contacts')
          .select('email, name')
          .eq('client_id', clientId)
          .or(`email.ilike.%${emailInput}%,name.ilike.%${emailInput}%`)
          .limit(5)

        if (data && data.length > 0) {
          setContactSuggestions(data as ContactSuggestion[])
          setShowSuggestions(true)
          return
        }
      }
      // Fallback: search from all clients
      const { data } = await supabase
        .from('tt_clients')
        .select('email, name')
        .not('email', 'is', null)
        .or(`email.ilike.%${emailInput}%,name.ilike.%${emailInput}%`)
        .limit(5)

      setContactSuggestions((data || []).filter(d => d.email) as ContactSuggestion[])
      setShowSuggestions((data || []).length > 0)
    }, 300)
    return () => clearTimeout(timer)
  }, [emailInput, clientId, supabase])

  // Add recipient
  function addRecipient(email: string, name: string, field: 'to' | 'cc' | 'bcc') {
    const r: Recipient = { email, name: name || email, type: field }
    const setter = field === 'to' ? setToRecipients : field === 'cc' ? setCcRecipients : setBccRecipients
    const current = field === 'to' ? toRecipients : field === 'cc' ? ccRecipients : bccRecipients
    if (!current.some(x => x.email === email)) {
      setter([...current, r])
    }
    setEmailInput('')
    setShowSuggestions(false)
  }

  function removeRecipient(email: string, field: 'to' | 'cc' | 'bcc') {
    const setter = field === 'to' ? setToRecipients : field === 'cc' ? setCcRecipients : setBccRecipients
    const current = field === 'to' ? toRecipients : field === 'cc' ? ccRecipients : bccRecipients
    setter(current.filter(r => r.email !== email))
  }

  function handleEmailKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
      e.preventDefault()
      const clean = emailInput.trim().replace(/,$/g, '')
      if (clean.includes('@')) {
        addRecipient(clean, '', activeField)
      }
    }
  }

  // Generate content based on format
  function generateContent(): string {
    const doc = docData || {
      type: documentType,
      display_ref: documentNumber,
      system_code: documentNumber,
      status: 'draft',
      currency: currency,
      subtotal: total,
      tax_amount: 0,
      tax_rate: 21,
      total: total,
      notes: '',
      created_at: new Date().toISOString(),
    }

    const comp = companyData || {
      name: 'TorqueTools',
    }

    const cli = clientData || {
      name: clientName,
      email: clientEmail || null,
    }

    const docItems = (items || []).map(i => ({
      ...i,
      notes: i.notes || '',
      is_section: i.is_section || false,
      section_label: i.section_label || '',
    }))

    switch (selectedFormat) {
      case 'pdf':
      case 'html':
        return generateDocumentHTML(doc, docItems, comp, cli, {
          format: selectedFormat === 'pdf' ? 'print' : 'email',
          language,
        })
      case 'excel':
        return generateDocumentExcelXML(doc, docItems, comp, cli, language)
      case 'text':
        return generateDocumentText(doc, docItems, comp, cli, language)
      default:
        return generateDocumentHTML(doc, docItems, comp, cli, { format: 'full', language })
    }
  }

  // Handle send
  async function handleSend() {
    setSending(true)
    try {
      const allRecipients = [
        ...toRecipients,
        ...ccRecipients.map(r => ({ ...r, type: 'cc' as const })),
        ...bccRecipients.map(r => ({ ...r, type: 'bcc' as const })),
      ]

      // Generate tracking ID
      const trackingId = trackOpens
        ? `trk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
        : null

      // Generate share link for link format
      let shareLink: string | null = null
      if (selectedFormat === 'link') {
        shareLink = `${window.location.origin}/doc/view/${trackingId || Date.now()}`
      }

      // Save send record
      if (documentId) {
        await supabase.from('tt_document_sends').insert({
          document_id: documentId,
          document_type: documentType,
          document_ref: documentNumber,
          channel: selectedFormat === 'link' ? 'link' : 'email',
          format: selectedFormat,
          recipients: allRecipients,
          subject,
          message: messageBody,
          tracking_id: trackingId,
          delivery_status: 'sent',
          share_link: shareLink,
          share_link_expires_at: shareLink
            ? new Date(Date.now() + parseInt(linkExpiry) * 24 * 60 * 60 * 1000).toISOString()
            : null,
          share_link_password: linkPassword || null,
          attachments: [
            { name: `${documentNumber}.${selectedFormat === 'excel' ? 'xls' : selectedFormat === 'text' ? 'txt' : 'pdf'}`, size: '~', url: '' },
            ...extraAttachments.map(a => ({ name: a.name, size: a.size, url: '' })),
          ],
        })
      }

      // Execute format-specific action
      const content = generateContent()

      switch (selectedFormat) {
        case 'pdf': {
          printDocumentHTML(content)
          break
        }
        case 'html': {
          // Open in Gmail with HTML body
          const toEmails = toRecipients.map(r => r.email).join(',')
          const ccEmails = ccRecipients.map(r => r.email).join(',')
          const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(toEmails)}&cc=${encodeURIComponent(ccEmails)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`
          window.open(gmailUrl, '_blank')
          break
        }
        case 'excel': {
          downloadDocument(content, `${documentNumber}.xls`, 'application/vnd.ms-excel')
          break
        }
        case 'word': {
          const wordContent = generateContent()
          const wordHTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${wordContent}</body></html>`
          downloadDocument(wordHTML, `${documentNumber}.doc`, 'application/msword')
          break
        }
        case 'text': {
          downloadDocument(content, `${documentNumber}.txt`, 'text/plain')
          break
        }
        case 'link': {
          if (shareLink) {
            await navigator.clipboard.writeText(shareLink)
          }
          break
        }
      }

      setSent(true)
      onSent?.()

      // Reload history
      if (documentId) {
        await loadSendHistory()
      }
    } catch (err) {
      console.error('Error sending:', err)
    } finally {
      setSending(false)
    }
  }

  // Handle copy message
  function handleCopyMessage() {
    navigator.clipboard.writeText(messageBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle WhatsApp
  function handleWhatsApp() {
    const text = `${docLabel} ${documentNumber}\nCliente: ${clientName}\nTotal: ${formatCurrency(total, currency)}\n\n${messageBody}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  // ===============================================================
  // RENDER
  // ===============================================================

  const steps = [
    { label: 'Destinatarios', icon: Mail },
    { label: 'Formato', icon: FileText },
    { label: 'Contenido', icon: AlignLeft },
    { label: 'Adjuntos', icon: Paperclip },
    { label: 'Opciones', icon: Shield },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Enviar ${docLabel}`} size="xl">
      <div className="space-y-4">

        {/* Success state */}
        {sent && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#10B981]/20 flex items-center justify-center">
              <CheckCircle size={32} className="text-[#10B981]" />
            </div>
            <h3 className="text-lg font-semibold text-[#F0F2F5] mb-2">Enviado correctamente</h3>
            <p className="text-sm text-[#9CA3AF] mb-1">
              {docLabel} {documentNumber} enviado a {toRecipients.map(r => r.email).join(', ')}
            </p>
            <p className="text-xs text-[#6B7280]">
              Formato: {FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.label} | {trackOpens ? 'Tracking activado' : 'Sin tracking'}
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <Button variant="outline" size="sm" onClick={() => { setSent(false); setActiveStep(0) }}>
                Enviar otro
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        {!sent && (
          <>
            {/* Step indicator */}
            <div className="flex items-center gap-1 bg-[#0B0E13] rounded-xl p-1 border border-[#1E2330]">
              {steps.map((step, i) => {
                const Icon = step.icon
                return (
                  <button
                    key={i}
                    onClick={() => setActiveStep(i)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                      activeStep === i
                        ? 'bg-[#1E2330] text-[#FF6600]'
                        : 'text-[#6B7280] hover:text-[#9CA3AF]'
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                )
              })}
            </div>

            {/* STEP 1: Recipients */}
            {activeStep === 0 && (
              <div className="space-y-3">
                {/* TO field */}
                <div>
                  <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">Para (TO)</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-[#0B0E13] border border-[#2A3040] rounded-lg min-h-[40px]">
                    {toRecipients.map(r => (
                      <span key={r.email} className="inline-flex items-center gap-1 px-2 py-1 bg-[#FF6600]/20 text-[#FF6600] text-xs rounded-full">
                        {r.name || r.email}
                        <button onClick={() => removeRecipient(r.email, 'to')} className="hover:text-white">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <div className="relative flex-1 min-w-[200px]" ref={suggestRef}>
                      <input
                        type="email"
                        value={activeField === 'to' ? emailInput : ''}
                        onChange={(e) => { setEmailInput(e.target.value); setActiveField('to') }}
                        onKeyDown={handleEmailKeyDown}
                        onFocus={() => setActiveField('to')}
                        placeholder="email@empresa.com"
                        className="w-full bg-transparent text-sm text-[#F0F2F5] placeholder:text-[#4B5563] outline-none py-1 px-1"
                      />
                      {showSuggestions && activeField === 'to' && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl z-50 max-h-[160px] overflow-y-auto">
                          {contactSuggestions.map(s => (
                            <button
                              key={s.email}
                              onClick={() => addRecipient(s.email, s.name, 'to')}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#2A3040] text-left"
                            >
                              <span className="text-[#F0F2F5]">{s.name}</span>
                              <span className="text-[#6B7280] text-xs">{s.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CC/BCC toggle */}
                <button
                  onClick={() => setShowCcBcc(!showCcBcc)}
                  className="text-xs text-[#FF6600] hover:text-[#E55A00] flex items-center gap-1"
                >
                  {showCcBcc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  CC / BCC
                </button>

                {showCcBcc && (
                  <>
                    {/* CC */}
                    <div>
                      <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">CC</label>
                      <div className="flex flex-wrap gap-1.5 p-2 bg-[#0B0E13] border border-[#2A3040] rounded-lg min-h-[36px]">
                        {ccRecipients.map(r => (
                          <span key={r.email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#3B82F6]/20 text-[#3B82F6] text-xs rounded-full">
                            {r.email}
                            <button onClick={() => removeRecipient(r.email, 'cc')} className="hover:text-white"><X size={12} /></button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={activeField === 'cc' ? emailInput : ''}
                          onChange={(e) => { setEmailInput(e.target.value); setActiveField('cc') }}
                          onKeyDown={handleEmailKeyDown}
                          onFocus={() => setActiveField('cc')}
                          placeholder="cc@empresa.com"
                          className="flex-1 min-w-[150px] bg-transparent text-sm text-[#F0F2F5] placeholder:text-[#4B5563] outline-none py-0.5 px-1"
                        />
                      </div>
                    </div>

                    {/* BCC */}
                    <div>
                      <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">BCC</label>
                      <div className="flex flex-wrap gap-1.5 p-2 bg-[#0B0E13] border border-[#2A3040] rounded-lg min-h-[36px]">
                        {bccRecipients.map(r => (
                          <span key={r.email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#6B7280]/20 text-[#6B7280] text-xs rounded-full">
                            {r.email}
                            <button onClick={() => removeRecipient(r.email, 'bcc')} className="hover:text-white"><X size={12} /></button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={activeField === 'bcc' ? emailInput : ''}
                          onChange={(e) => { setEmailInput(e.target.value); setActiveField('bcc') }}
                          onKeyDown={handleEmailKeyDown}
                          onFocus={() => setActiveField('bcc')}
                          placeholder="bcc@empresa.com"
                          className="flex-1 min-w-[150px] bg-transparent text-sm text-[#F0F2F5] placeholder:text-[#4B5563] outline-none py-0.5 px-1"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Quick add from WhatsApp */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={handleWhatsApp} className="!border-[#25D366]/30 text-[#25D366] hover:!bg-[#25D366]/10">
                    <MessageCircle size={14} /> WhatsApp
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: Format */}
            {activeStep === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map(fmt => {
                  const Icon = fmt.icon
                  const isSelected = selectedFormat === fmt.value
                  return (
                    <button
                      key={fmt.value}
                      onClick={() => setSelectedFormat(fmt.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-[#FF6600] bg-[#FF6600]/10'
                          : 'border-[#2A3040] bg-[#0B0E13] hover:border-[#3A4050]'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${fmt.color}20` }}
                      >
                        <Icon size={20} style={{ color: fmt.color }} />
                      </div>
                      <span className={`text-sm font-semibold ${isSelected ? 'text-[#FF6600]' : 'text-[#F0F2F5]'}`}>
                        {fmt.label}
                      </span>
                      <span className="text-[10px] text-[#6B7280] text-center leading-tight">
                        {fmt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* STEP 3: Content */}
            {activeStep === 2 && (
              <div className="space-y-3">
                {/* Language selector */}
                <div className="flex gap-1 bg-[#0B0E13] rounded-lg p-0.5 border border-[#1E2330] w-fit">
                  {(['es', 'en', 'pt'] as Language[]).map(lang_opt => (
                    <button
                      key={lang_opt}
                      onClick={() => { setLanguage(lang_opt); setMessageBody(getDefaultMessage(lang_opt)) }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        language === lang_opt
                          ? 'bg-[#1E2330] text-[#FF6600]'
                          : 'text-[#6B7280] hover:text-[#9CA3AF]'
                      }`}
                    >
                      {lang_opt === 'es' ? 'Espanol' : lang_opt === 'en' ? 'English' : 'Portugues'}
                    </button>
                  ))}
                </div>

                <Input
                  label="Asunto"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />

                <div>
                  <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">
                    Mensaje
                  </label>
                  <textarea
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={8}
                    className="w-full bg-[#0B0E13] border border-[#2A3040] rounded-lg p-3 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 resize-y"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyMessage}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                    <Eye size={14} /> Vista previa
                  </Button>
                </div>

                {/* Preview */}
                {showPreview && (
                  <div className="border border-[#2A3040] rounded-lg overflow-hidden">
                    <div className="bg-[#1C2230] px-3 py-2 text-xs text-[#9CA3AF] flex items-center justify-between">
                      <span>Vista previa del documento</span>
                      <button onClick={() => setShowPreview(false)} className="hover:text-[#F0F2F5]">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="bg-white max-h-[300px] overflow-y-auto">
                      <iframe
                        srcDoc={generateContent()}
                        className="w-full h-[300px] border-0"
                        title="preview"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Attachments */}
            {activeStep === 3 && (
              <div className="space-y-3">
                {/* Main document (auto) */}
                <div className="flex items-center gap-3 p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.color || '#FF6600'}20` }}>
                    <FileText size={16} style={{ color: FORMAT_OPTIONS.find(f => f.value === selectedFormat)?.color || '#FF6600' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#F0F2F5]">
                      {documentNumber}.{selectedFormat === 'excel' ? 'xls' : selectedFormat === 'text' ? 'txt' : 'pdf'}
                    </p>
                    <p className="text-xs text-[#6B7280]">Documento principal (automatico)</p>
                  </div>
                  <span className="text-xs text-[#10B981] font-medium">Incluido</span>
                </div>

                {/* Extra attachments */}
                {extraAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg">
                    <Paperclip size={16} className="text-[#6B7280]" />
                    <div className="flex-1">
                      <p className="text-sm text-[#F0F2F5]">{att.name}</p>
                      <p className="text-xs text-[#6B7280]">{att.size}</p>
                    </div>
                    <button
                      onClick={() => setExtraAttachments(extraAttachments.filter((_, j) => j !== i))}
                      className="text-[#6B7280] hover:text-[#EF4444]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {/* Add attachment area */}
                <div
                  className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#2A3040] rounded-lg hover:border-[#FF6600]/50 transition-colors cursor-pointer"
                  onClick={() => {
                    // Simulate file input
                    const input = window.document.createElement('input')
                    input.type = 'file'
                    input.multiple = true
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files
                      if (files) {
                        const newAtts = Array.from(files).map(f => ({
                          name: f.name,
                          size: f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
                        }))
                        setExtraAttachments([...extraAttachments, ...newAtts])
                      }
                    }
                    input.click()
                  }}
                >
                  <Upload size={20} className="text-[#6B7280] mb-2" />
                  <span className="text-xs text-[#6B7280]">Arrastra archivos aca o hace click para agregar</span>
                </div>
              </div>
            )}

            {/* STEP 5: Options */}
            {activeStep === 4 && (
              <div className="space-y-4">
                {/* Track opens */}
                <label className="flex items-center gap-3 p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg cursor-pointer hover:border-[#3A4050]">
                  <input
                    type="checkbox"
                    checked={trackOpens}
                    onChange={(e) => setTrackOpens(e.target.checked)}
                    className="w-4 h-4 rounded border-[#2A3040] text-[#FF6600] focus:ring-[#FF6600]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#F0F2F5]">
                      <Eye size={14} className="text-[#FF6600]" /> Activar tracking de apertura
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5">Recibiras notificacion cuando el cliente abra el documento</p>
                  </div>
                </label>

                {/* Password protection (for link) */}
                {selectedFormat === 'link' && (
                  <>
                    <div className="p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#F0F2F5]">
                        <Shield size={14} className="text-[#FF6600]" /> Proteger con contrasena
                      </div>
                      <Input
                        placeholder="Dejar vacio para sin contrasena"
                        value={linkPassword}
                        onChange={(e) => setLinkPassword(e.target.value)}
                        type="password"
                      />
                    </div>

                    <div className="p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#F0F2F5]">
                        <Clock size={14} className="text-[#FF6600]" /> Expiracion del link
                      </div>
                      <div className="flex gap-2">
                        {[
                          { value: '7', label: '7 dias' },
                          { value: '30', label: '30 dias' },
                          { value: '0', label: 'Nunca' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setLinkExpiry(opt.value)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                              linkExpiry === opt.value
                                ? 'bg-[#FF6600] text-white'
                                : 'bg-[#1E2330] text-[#9CA3AF] hover:text-[#F0F2F5]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Save as template */}
                <label className="flex items-center gap-3 p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg cursor-pointer hover:border-[#3A4050] opacity-60">
                  <input type="checkbox" disabled className="w-4 h-4 rounded border-[#2A3040]" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#F0F2F5]">
                      <BookmarkPlus size={14} className="text-[#6B7280]" /> Guardar como plantilla
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5">Proximamente</p>
                  </div>
                </label>
              </div>
            )}

            {/* Navigation + Send */}
            <div className="flex items-center justify-between pt-3 border-t border-[#1E2330]">
              <div className="flex gap-2">
                {activeStep > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setActiveStep(activeStep - 1)}>
                    Anterior
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {activeStep < steps.length - 1 && (
                  <Button variant="outline" size="sm" onClick={() => setActiveStep(activeStep + 1)}>
                    Siguiente
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSend}
                  loading={sending}
                  disabled={toRecipients.length === 0 && selectedFormat !== 'link'}
                  className="!bg-[#FF6600] hover:!bg-[#E55A00] min-w-[140px]"
                >
                  <Send size={16} /> Enviar
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ========== SEND HISTORY ========== */}
        {documentId && (
          <div className="border-t border-[#1E2330] pt-3 mt-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm font-medium text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors w-full"
            >
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Historial de envios ({sendHistory.length})
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2 max-h-[250px] overflow-y-auto">
                {loadingHistory && (
                  <div className="text-center py-4">
                    <Loader2 className="animate-spin mx-auto text-[#FF6600]" size={20} />
                  </div>
                )}

                {!loadingHistory && sendHistory.length === 0 && (
                  <p className="text-center py-4 text-xs text-[#4B5563]">
                    Sin envios previos
                  </p>
                )}

                {sendHistory.map(record => {
                  const statusCfg = STATUS_CONFIG[record.delivery_status] || STATUS_CONFIG.sent
                  const recipients = (record.recipients || []) as Recipient[]
                  return (
                    <div
                      key={record.id}
                      className="flex items-start gap-3 p-3 bg-[#0B0E13] border border-[#2A3040] rounded-lg"
                    >
                      <div className="shrink-0 mt-0.5">
                        {record.delivery_status === 'opened' || record.open_count > 0 ? (
                          <Eye size={14} className="text-[#10B981]" />
                        ) : record.delivery_status === 'bounced' || record.delivery_status === 'failed' ? (
                          <AlertCircle size={14} className="text-[#EF4444]" />
                        ) : (
                          <Send size={14} className="text-[#F59E0B]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ color: statusCfg.color, backgroundColor: statusCfg.bg }}
                          >
                            {statusCfg.label}
                            {record.open_count > 0 && ` (${record.open_count}x)`}
                          </span>
                          <span className="text-[10px] text-[#6B7280] uppercase">
                            {record.format} / {record.channel}
                          </span>
                        </div>
                        <p className="text-xs text-[#9CA3AF] mt-1 truncate">
                          {recipients.map(r => r.email).join(', ')}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-[#4B5563]">
                            {record.sent_at ? formatRelative(record.sent_at) : ''}
                          </span>
                          {record.first_opened_at && (
                            <span className="text-[10px] text-[#10B981]">
                              Abierto {formatRelative(record.first_opened_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
