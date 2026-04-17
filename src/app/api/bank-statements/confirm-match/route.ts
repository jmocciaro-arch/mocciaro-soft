import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/bank-statements/confirm-match
 * Body: { lineId, action: 'confirm' | 'reject', documentId?, confirmedBy? }
 *
 * Al confirmar, marca la factura como cobrada (status=cobrada)
 * y registra el pago en metadata del documento.
 */
export async function POST(req: NextRequest) {
  try {
    const { lineId, action, documentId, confirmedBy } = await req.json()
    if (!lineId || !action) return NextResponse.json({ error: 'lineId y action requeridos' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    if (action === 'reject') {
      await supabase
        .from('tt_bank_statement_lines')
        .update({ match_status: 'rejected', matched_document_id: null, matched_client_id: null })
        .eq('id', lineId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'confirm') {
      // Si cambió la factura, actualizarla
      const { data: line } = await supabase
        .from('tt_bank_statement_lines')
        .select('*, matched_document_id')
        .eq('id', lineId)
        .single()
      if (!line) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

      const docId = documentId || line.matched_document_id
      if (!docId) return NextResponse.json({ error: 'documentId requerido' }, { status: 400 })

      await supabase
        .from('tt_bank_statement_lines')
        .update({
          match_status: 'confirmed',
          matched_document_id: docId,
          confirmed_by: confirmedBy || null,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', lineId)

      // Marcar factura como cobrada y guardar info del pago
      const { data: doc } = await supabase
        .from('tt_documents')
        .select('metadata')
        .eq('id', docId)
        .single()
      const md = (doc?.metadata || {}) as Record<string, unknown>
      await supabase
        .from('tt_documents')
        .update({
          status: 'cobrada',
          metadata: {
            ...md,
            payment: {
              bank_line_id: lineId,
              amount: line.amount,
              date: line.date,
              reference: line.reference,
              description: line.description,
            },
          },
        })
        .eq('id', docId)

      return NextResponse.json({ ok: true, documentId: docId })
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
