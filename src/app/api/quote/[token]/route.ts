import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/quote/[token]
// Devuelve datos completos del portal: cotización + branding + items + comentarios + historial
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  // 1. Validar token
  const { data: qt, error: qtErr } = await supabaseAdmin
    .from('tt_quote_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (qtErr || !qt) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  if (qt.expires_at && new Date(qt.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Este enlace ha vencido' }, { status: 410 })
  }

  // 2. Registrar visita
  await supabaseAdmin
    .from('tt_quote_tokens')
    .update({
      view_count: (qt.view_count ?? 0) + 1,
      viewed_at: qt.viewed_at ?? new Date().toISOString(),
    })
    .eq('id', qt.id)

  // 3. Obtener documento con branding y cliente
  const { data: doc } = await supabaseAdmin
    .from('tt_documents')
    .select(`
      *,
      client:tt_clients ( id, name, legal_name, tax_id, email, phone, address, city, country ),
      company:tt_companies (
        id, name, trade_name, legal_name, tax_id, country, currency,
        address, city, postal_code, phone, email_main, website,
        logo_url, brand_color, secondary_color, footer_note, bank_details
      )
    `)
    .eq('id', qt.document_id)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  }

  // 4. Obtener comentarios
  const { data: comments } = await supabaseAdmin
    .from('tt_quote_comments')
    .select('id, author_name, author_type, message, created_at')
    .eq('token_id', qt.id)
    .order('created_at', { ascending: true })

  // 5. Historial de transacciones del cliente con esta empresa
  let history: unknown[] = []
  if (qt.client_id) {
    const { data: hist } = await supabaseAdmin
      .from('tt_documents')
      .select('id, doc_type, system_code, display_ref, status, total, currency, created_at')
      .eq('client_id', qt.client_id)
      .eq('company_id', qt.company_id)
      .order('created_at', { ascending: false })
      .limit(20)
    history = (hist ?? []).map((h: Record<string, unknown>) => ({ ...h, type: h.doc_type }))
  }

  // 6. Items del documento
  const items: unknown[] = doc.metadata?.lines ?? doc.metadata?.stelorder_raw?.lines ?? []

  return NextResponse.json({
    token: {
      id: qt.id,
      accepted_at: qt.accepted_at,
      accepted_by: qt.accepted_by,
      rejected_at: qt.rejected_at,
      rejection_reason: qt.rejection_reason,
      expires_at: qt.expires_at,
    },
    document: {
      id: doc.id,
      type: doc.doc_type,
      system_code: doc.system_code,
      display_ref: doc.display_ref,
      legal_number: doc.legal_number,
      status: doc.status,
      invoice_date: doc.invoice_date,
      valid_until: doc.valid_until,
      currency: doc.currency,
      subtotal: doc.subtotal,
      tax_amount: doc.tax_amount,
      tax_rate: doc.tax_rate,
      total: doc.total,
      notes: doc.notes,
      incoterm: doc.incoterm,
      payment_terms: doc.payment_terms,
    },
    company: doc.company,
    client: doc.client,
    items,
    comments: comments ?? [],
    history,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quote/[token]
// Body: { action: 'accept'|'reject'|'comment', signature_base64?, name?, reason?, message? }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const body = await req.json() as {
    action: 'accept' | 'reject' | 'comment'
    signature_base64?: string
    name?: string
    reason?: string
    message?: string
    author_name?: string
    author_email?: string
  }

  const { action } = body

  if (!action) {
    return NextResponse.json({ error: 'action requerida' }, { status: 400 })
  }

  // Validar token
  const { data: qt, error: qtErr } = await supabaseAdmin
    .from('tt_quote_tokens')
    .select('id, document_id, company_id, accepted_at, rejected_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (qtErr || !qt) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  if (qt.expires_at && new Date(qt.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Este enlace ha vencido' }, { status: 410 })
  }

  if (action === 'accept') {
    if (qt.accepted_at) {
      return NextResponse.json({ error: 'Esta cotización ya fue aceptada' }, { status: 409 })
    }
    if (qt.rejected_at) {
      return NextResponse.json({ error: 'Esta cotización fue rechazada' }, { status: 409 })
    }

    let signatureUrl: string | null = null

    // Guardar firma en storage si se proveyó
    if (body.signature_base64) {
      try {
        const base64Data = body.signature_base64.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const fileName = `${qt.id}/${Date.now()}.png`

        const { error: uploadErr } = await supabaseAdmin.storage
          .from('quote-signatures')
          .upload(fileName, buffer, {
            contentType: 'image/png',
            upsert: false,
          })

        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage
            .from('quote-signatures')
            .getPublicUrl(fileName)
          signatureUrl = urlData?.publicUrl ?? null
        }
      } catch (uploadEx) {
        console.error('[quote/accept] Error subiendo firma:', uploadEx)
      }
    }

    const now = new Date().toISOString()

    // Actualizar token
    await supabaseAdmin
      .from('tt_quote_tokens')
      .update({
        accepted_at: now,
        accepted_by: body.name || 'Cliente',
        signature_url: signatureUrl,
      })
      .eq('id', qt.id)

    // Actualizar estado del documento
    await supabaseAdmin
      .from('tt_documents')
      .update({ status: 'accepted', updated_at: now })
      .eq('id', qt.document_id)

    return NextResponse.json({ ok: true, action: 'accept', signature_url: signatureUrl })
  }

  if (action === 'reject') {
    if (qt.accepted_at) {
      return NextResponse.json({ error: 'Esta cotización ya fue aceptada' }, { status: 409 })
    }
    if (qt.rejected_at) {
      return NextResponse.json({ error: 'Esta cotización ya fue rechazada' }, { status: 409 })
    }

    if (!body.reason) {
      return NextResponse.json({ error: 'reason requerido para rechazar' }, { status: 400 })
    }

    const now = new Date().toISOString()

    await supabaseAdmin
      .from('tt_quote_tokens')
      .update({
        rejected_at: now,
        rejection_reason: body.reason,
      })
      .eq('id', qt.id)

    await supabaseAdmin
      .from('tt_documents')
      .update({ status: 'rejected', updated_at: now })
      .eq('id', qt.document_id)

    return NextResponse.json({ ok: true, action: 'reject' })
  }

  if (action === 'comment') {
    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message requerido' }, { status: 400 })
    }

    const { data: newComment, error: commentErr } = await supabaseAdmin
      .from('tt_quote_comments')
      .insert({
        token_id: qt.id,
        document_id: qt.document_id,
        author_name: body.author_name || 'Cliente',
        author_email: body.author_email || null,
        author_type: 'client',
        message: body.message.trim(),
      })
      .select('id, author_name, author_type, message, created_at')
      .single()

    if (commentErr) {
      return NextResponse.json({ error: commentErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, action: 'comment', comment: newComment })
  }

  return NextResponse.json({ error: 'action desconocida' }, { status: 400 })
}
