/**
 * payments.ts — FASE 1.2
 *
 * Capa única para registrar cobros y leer estado de facturación.
 * Usa la VIEW tt_payments (migration v73) que mapea a tt_invoice_payments
 * con aliases (method, reference) para no romper código viejo.
 *
 * Resume estados de factura para la UI:
 *   pendiente: status='draft'|'sent' AND paid=0
 *   parcial:   0 < paid < total
 *   pagada:    paid >= total → status='paid'
 *   vencida:   due_date < today AND paid < total
 */

import { createClient } from '@/lib/supabase/client'
import { withIdempotency, buildIdempotencyKey } from '@/lib/idempotency'

export type InvoicePaymentStatus = 'pendiente' | 'parcial' | 'pagada' | 'vencida'

export interface PaymentInput {
  invoiceId: string
  amount: number
  method: 'transferencia' | 'efectivo' | 'tarjeta' | 'cheque' | 'pagare' | 'compensacion' | 'otro'
  reference?: string | null
  bankAccountId?: string | null
  paymentDate?: string  // YYYY-MM-DD
  notes?: string | null
  /** Usuario que registra el cobro (para idempotencia + audit). */
  actorUserId?: string | null
}

export interface PaymentRecord {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_date: string
  method: string
  reference: string | null
  bank_account_id: string | null
  notes: string | null
  status: 'completed'
  created_at: string
}

/**
 * Registra un cobro contra una factura. Idempotente vía
 * idempotency_key = register_payment:{invoiceId}:{amount}:{date}:{userId}.
 *
 * Re-llamar con los mismos params devuelve el cobro original sin
 * crear duplicado. Útil para retry de red.
 */
export async function registerInvoicePayment(input: PaymentInput): Promise<{
  ok: boolean
  payment?: PaymentRecord
  newStatus?: InvoicePaymentStatus
  error?: string
}> {
  if (input.amount <= 0) {
    return { ok: false, error: 'El importe debe ser mayor a 0' }
  }

  const paymentDate = input.paymentDate ?? new Date().toISOString().slice(0, 10)
  const userKey = input.actorUserId ?? 'anon'
  const key = buildIdempotencyKey(
    'register_payment',
    input.invoiceId,
    String(input.amount.toFixed(2)),
    paymentDate,
    userKey
  )

  try {
    const result = await withIdempotency<{ payment: PaymentRecord; newStatus: InvoicePaymentStatus }>(
      { key, scope: 'register_payment', userId: input.actorUserId },
      async () => doRegisterPayment(input, paymentDate)
    )
    return { ok: true, payment: result.payment, newStatus: result.newStatus }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function doRegisterPayment(
  input: PaymentInput,
  paymentDate: string
): Promise<{ payment: PaymentRecord; newStatus: InvoicePaymentStatus }> {
  const sb = createClient()

  // Insert via la VIEW tt_payments (los INSTEAD OF triggers escriben en
  // tt_invoice_payments con los aliases correctos).
  const { data: inserted, error } = await sb
    .from('tt_payments')
    .insert({
      invoice_id: input.invoiceId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      payment_date: paymentDate,
      bank_account_id: input.bankAccountId ?? null,
      notes: input.notes ?? null,
      created_by: input.actorUserId ?? null,
    })
    .select()
    .single()

  if (error || !inserted) {
    throw new Error(error?.message ?? 'No se pudo registrar el cobro')
  }

  // Actualizar status de la factura según total pagado
  const { data: payments } = await sb
    .from('tt_payments')
    .select('amount')
    .eq('invoice_id', input.invoiceId)

  const totalPaid = (payments || []).reduce(
    (sum: number, p: { amount: number | null }) => sum + ((p.amount as number) || 0),
    0
  )

  const { data: inv } = await sb
    .from('tt_invoices')
    .select('total, due_date')
    .eq('id', input.invoiceId)
    .single()

  const invTotal = (inv?.total as number) || 0
  const fullyPaid = totalPaid >= invTotal
  const partial = !fullyPaid && totalPaid > 0
  const dueDate = inv?.due_date as string | undefined
  const overdue =
    !fullyPaid && dueDate && new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10))

  const newInvoiceStatus = fullyPaid ? 'paid' : partial ? 'partial' : 'draft'

  await sb.from('tt_invoices').update({ status: newInvoiceStatus }).eq('id', input.invoiceId)

  const newStatus: InvoicePaymentStatus = fullyPaid
    ? 'pagada'
    : overdue
    ? 'vencida'
    : partial
    ? 'parcial'
    : 'pendiente'

  return {
    payment: inserted as unknown as PaymentRecord,
    newStatus,
  }
}

/**
 * Status computado por factura (lectura). No requiere RPC.
 */
export function computeInvoicePaymentStatus(args: {
  total: number
  paid: number
  due_date?: string | null
  status?: string | null
}): InvoicePaymentStatus {
  if ((args.status === 'paid') || args.paid >= args.total) return 'pagada'
  if (args.paid > 0) return 'parcial'
  if (args.due_date) {
    const today = new Date().toISOString().slice(0, 10)
    if (args.due_date < today) return 'vencida'
  }
  return 'pendiente'
}

/**
 * Lista facturas con paid_amount calculado y status semántico.
 * Usado por la UI /ventas tab Cobros.
 */
export async function listInvoicesWithPaymentStatus(filters: {
  companyId?: string | null
  status?: InvoicePaymentStatus
  clientId?: string | null
  limit?: number
}): Promise<Array<{
  id: string
  doc_number: string
  client_id: string
  client_name?: string
  total: number
  paid: number
  outstanding: number
  due_date: string | null
  payment_status: InvoicePaymentStatus
  currency: string
}>> {
  const sb = createClient()

  let query = sb
    .from('tt_invoices')
    .select('id, doc_number, client_id, total, currency, due_date, status, company_id')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(filters.limit ?? 500)

  if (filters.companyId) query = query.eq('company_id', filters.companyId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)

  const { data: invoices } = await query
  if (!invoices || invoices.length === 0) return []

  const invoiceIds = invoices.map((i) => i.id as string)

  const { data: payments } = await sb
    .from('tt_payments')
    .select('invoice_id, amount')
    .in('invoice_id', invoiceIds)

  const paidByInvoice = new Map<string, number>()
  for (const p of payments || []) {
    const acc = paidByInvoice.get(p.invoice_id as string) ?? 0
    paidByInvoice.set(p.invoice_id as string, acc + ((p.amount as number) || 0))
  }

  const clientIds = Array.from(new Set(invoices.map((i) => i.client_id as string).filter(Boolean)))
  const { data: clients } = await sb
    .from('tt_clients')
    .select('id, legal_name, name')
    .in('id', clientIds.length > 0 ? clientIds : ['__none__'])
  const clientNameById = new Map<string, string>()
  for (const c of clients || []) {
    clientNameById.set(
      c.id as string,
      (c.legal_name as string) || (c.name as string) || ''
    )
  }

  const out = invoices.map((i) => {
    const paid = paidByInvoice.get(i.id as string) ?? 0
    const total = (i.total as number) || 0
    const status = computeInvoicePaymentStatus({
      total,
      paid,
      due_date: i.due_date as string | null,
      status: i.status as string | null,
    })
    return {
      id: i.id as string,
      doc_number: (i.doc_number as string) || '',
      client_id: (i.client_id as string) || '',
      client_name: clientNameById.get(i.client_id as string),
      total,
      paid,
      outstanding: Math.max(0, total - paid),
      due_date: (i.due_date as string | null) ?? null,
      payment_status: status,
      currency: (i.currency as string) || 'EUR',
    }
  })

  if (filters.status) {
    return out.filter((r) => r.payment_status === filters.status)
  }
  return out
}

/**
 * Cuentas bancarias activas de una empresa (para el modal de registro de cobro).
 */
export async function listActiveBankAccounts(companyId: string): Promise<Array<{
  id: string
  bank_name: string | null
  account_holder: string | null
  iban_or_cbu: string | null
  currency: string
}>> {
  const sb = createClient()
  const { data } = await sb
    .from('tt_bank_accounts')
    .select('id, bank_name, account_holder, iban_or_cbu, currency, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('bank_name', { ascending: true })

  return (data || []).map((b) => ({
    id: b.id as string,
    bank_name: (b.bank_name as string | null) ?? null,
    account_holder: (b.account_holder as string | null) ?? null,
    iban_or_cbu: (b.iban_or_cbu as string | null) ?? null,
    currency: (b.currency as string) || 'EUR',
  }))
}
