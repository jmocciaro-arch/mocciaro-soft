import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseBankStatement,
  matchBankLinesDeterministic,
  matchBankLinesWithAI,
  type OpenInvoice,
} from '@/lib/ai/parse-bank-statement'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/bank-statements/parse
 * Multipart: { file, companyId, bank_name?, account_number? }
 *
 * 1) Parsea el PDF
 * 2) Crea tt_bank_statements + tt_bank_statement_lines
 * 3) Carga facturas pendientes de la empresa y corre matching determinístico
 * 4) Pide a IA que sugiera para las líneas no matcheadas
 * 5) Devuelve preview para que el usuario confirme/rechace
 */
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const companyId = fd.get('companyId') as string | null
    const bankName = fd.get('bank_name') as string | null
    const accountNumber = fd.get('account_number') as string | null

    if (!file || !companyId) {
      return NextResponse.json({ error: 'file y companyId requeridos' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const result = await parseBankStatement(buf)
    if (!result.data) return NextResponse.json({ error: result.error }, { status: 500 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Upload PDF al bucket privado `bank-statements`. Guardamos un signed URL
    // de larga duración (mismo patrón que supplier-offers / OCs); la lectura
    // posterior debería re-firmar contra `extractStoragePath` si caduca.
    const path = `${companyId}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage
      .from('bank-statements')
      .upload(path, buf, { contentType: 'application/pdf' })
    let pdfUrl: string | null = null
    if (!upErr) {
      const { data: signed } = await supabase.storage
        .from('bank-statements')
        .createSignedUrl(path, 60 * 60 * 24 * 30) // 30 días
      pdfUrl = signed?.signedUrl ?? null
    } else {
      console.warn('[bank-statements parse] storage upload error:', upErr.message)
    }

    // Crear statement
    const { data: stmt, error: stmtErr } = await supabase
      .from('tt_bank_statements')
      .insert({
        company_id: companyId,
        bank_name: bankName || result.data.bank_name,
        account_number: accountNumber || result.data.account_number,
        currency: result.data.currency || 'ARS',
        period_from: result.data.period_from,
        period_to: result.data.period_to,
        opening_balance: result.data.opening_balance,
        closing_balance: result.data.closing_balance,
        original_pdf_url: pdfUrl,
        parsed_at: new Date().toISOString(),
        parsed_by: result.data.provider_used,
        lines_count: result.data.lines.length,
        raw_data: result.data,
        status: 'parsed',
      })
      .select('id')
      .single()
    if (stmtErr) throw stmtErr

    // Cargar facturas pendientes de la empresa
    const { data: openInvoicesRaw } = await supabase
      .from('tt_documents')
      .select(`
        id,
        client_id,
        legal_number,
        invoice_number,
        invoice_date,
        total,
        currency,
        client:tt_clients ( id, name, cuit )
      `)
      .eq('company_id', companyId)
      .eq('doc_type', 'factura')
      .in('status', ['emitida', 'autorizada', 'pendiente_cobro'])

    const openInvoices: OpenInvoice[] = (openInvoicesRaw || []).map((d: any) => ({
      document_id: d.id,
      client_id: d.client_id,
      client_name: d.client?.name,
      cuit: d.client?.cuit,
      legal_number: d.legal_number,
      invoice_number: d.invoice_number,
      invoice_date: d.invoice_date,
      total: Number(d.total) || 0,
      currency: d.currency || 'ARS',
      balance_due: Number(d.total) || 0,
    }))

    // Matching determinístico
    const detMatches = matchBankLinesDeterministic(result.data.lines, openInvoices)

    // Líneas unmatched a enviar a IA
    const unmatchedLines = detMatches
      .filter((m) => m.method === 'unmatched' && result.data!.lines[m.line_index].amount > 0)
      .map((m) => result.data!.lines[m.line_index])

    const aiMatches = unmatchedLines.length > 0 && openInvoices.length > 0
      ? await matchBankLinesWithAI(unmatchedLines, openInvoices)
      : []

    // Insertar líneas con su match preview
    const linesToInsert = result.data.lines.map((l, i) => {
      const det = detMatches.find((m) => m.line_index === i)
      let matchMethod = det?.method || 'unmatched'
      let docId: string | undefined = det?.document_id
      let clientId: string | undefined = det?.client_id
      let conf = det?.confidence || 0
      let reason = det?.reason || ''

      if (matchMethod === 'unmatched') {
        const ai = aiMatches.find((m) => m.line_index === unmatchedLines.findIndex((u) => u === l))
        if (ai?.suggestions?.[0]) {
          matchMethod = 'ai_suggested'
          docId = ai.suggestions[0].document_id
          conf = ai.suggestions[0].confidence
          reason = ai.suggestions[0].reason
          const inv = openInvoices.find((iv) => iv.document_id === docId)
          clientId = inv?.client_id || undefined
        }
      }

      return {
        statement_id: stmt.id,
        line_number: l.line_number ?? i + 1,
        date: l.date,
        description: l.description,
        reference: l.reference,
        amount: l.amount,
        balance: l.balance,
        type: l.type,
        matched_document_id: docId,
        matched_client_id: clientId,
        match_confidence: conf,
        match_method: matchMethod,
        match_reason: reason,
        match_status: conf >= 0.75 ? 'suggested' : 'unmatched',
      }
    })

    const { error: linesErr } = await supabase.from('tt_bank_statement_lines').insert(linesToInsert)
    if (linesErr) throw linesErr

    const matchedCount = linesToInsert.filter((l) => l.match_status === 'suggested').length
    await supabase
      .from('tt_bank_statements')
      .update({
        matched_count: matchedCount,
        unmatched_count: linesToInsert.length - matchedCount,
      })
      .eq('id', stmt.id)

    return NextResponse.json({
      ok: true,
      statementId: stmt.id,
      pdfUrl,
      totalLines: linesToInsert.length,
      matchedCount,
      unmatchedCount: linesToInsert.length - matchedCount,
      provider: result.data.provider_used,
    })
  } catch (err) {
    console.error('POST /api/bank-statements/parse error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
