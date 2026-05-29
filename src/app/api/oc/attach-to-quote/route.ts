/**
 * POST /api/oc/attach-to-quote
 *
 * Toma un PDF que /api/oc/parse subió al bucket privado 'client-pos' y:
 *   1. Lo descarga con service_role
 *   2. Lo sube al bucket 'document-attachments' con path
 *      'quote/{quoteId}/{ts}-{file_name}' (formato esperado por el sistema
 *      de attachments)
 *   3. Inserta una fila en tt_document_attachments con category='oc_cliente'
 *   4. Borra el original de 'client-pos' (cleanup)
 *
 * Idempotente: si ya existe un attachment 'oc_cliente' para esta cotización
 * con el mismo nombre de archivo, NO duplica.
 *
 * Body:
 *   {
 *     quote_id: string (uuid),       // tt_documents.id de la cotización
 *     source_path: string,           // path en bucket 'client-pos'
 *     file_name: string,             // nombre original del archivo (para mostrar)
 *   }
 *
 * Devuelve: { ok: true, attachment_id: string } o { error, status }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withCompanyFilter, ensureCompanyAccess } from '@/lib/auth/with-company-filter'

export const runtime = 'nodejs'
export const maxDuration = 30

const SOURCE_BUCKET = 'client-pos'
const TARGET_BUCKET = 'document-attachments'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const guard = await withCompanyFilter()
  if (!guard.ok) return guard.response

  const body = (await req.json().catch(() => null)) as
    | { quote_id?: string; source_path?: string; file_name?: string }
    | null

  if (!body?.quote_id || !body?.source_path || !body?.file_name) {
    return NextResponse.json(
      { error: 'quote_id, source_path y file_name son requeridos' },
      { status: 400 }
    )
  }

  const sb = adminClient()

  // Validar que la cotización exista y pertenezca a una empresa accesible
  // por el user actual. Sin esto, alguien con auth podría adjuntar PDFs a
  // cotizaciones de otras empresas.
  const { data: docRow, error: docErr } = await sb
    .from('tt_documents')
    .select('id, company_id, doc_type')
    .eq('id', body.quote_id)
    .maybeSingle()

  if (docErr || !docRow) {
    return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  const access = ensureCompanyAccess(guard, docRow.company_id as string)
  if (!access.ok) return access.response

  // Sanitizar file name para path (igual que document-attachments.ts)
  const safeName = body.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const targetPath = `quote/${body.quote_id}/${Date.now()}-${safeName}`

  // 1. Idempotencia: si ya existe un attachment 'oc_cliente' con el mismo
  //    nombre para esta cotización, no duplicamos. Devolvemos el existente.
  const { data: existing } = await sb
    .from('tt_document_attachments')
    .select('id')
    .eq('document_id', body.quote_id)
    .eq('document_type', 'quote')
    .eq('category', 'oc_cliente')
    .eq('name', body.file_name)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      ok: true,
      attachment_id: existing.id,
      already_existed: true,
    })
  }

  // 2. Descargar el PDF del bucket origen
  const { data: blob, error: dlErr } = await sb.storage
    .from(SOURCE_BUCKET)
    .download(body.source_path)

  if (dlErr || !blob) {
    return NextResponse.json(
      { error: `No se pudo descargar el PDF de ${SOURCE_BUCKET}: ${dlErr?.message || 'unknown'}` },
      { status: 500 }
    )
  }

  const fileSize = blob.size
  const mimeType = blob.type || 'application/pdf'

  // 3. Subir al bucket de attachments con el path canónico
  const buf = Buffer.from(await blob.arrayBuffer())
  const { error: upErr } = await sb.storage
    .from(TARGET_BUCKET)
    .upload(targetPath, buf, { contentType: mimeType, upsert: false })

  if (upErr) {
    return NextResponse.json(
      { error: `No se pudo subir el PDF a ${TARGET_BUCKET}: ${upErr.message}` },
      { status: 500 }
    )
  }

  // 4. Insertar la fila del attachment
  const { data: row, error: insErr } = await sb
    .from('tt_document_attachments')
    .insert({
      document_id: body.quote_id,
      document_type: 'quote',
      category: 'oc_cliente',
      name: body.file_name,
      description: 'Adjuntado automáticamente desde la importación de OC con IA',
      mime_type: mimeType,
      size_bytes: fileSize,
      storage_path: targetPath,
      uploaded_by_user_id: guard.ttUserId,
    })
    .select('id')
    .single()

  if (insErr || !row) {
    // Si la inserción falla, limpiamos el upload para no dejar archivo huérfano
    await sb.storage.from(TARGET_BUCKET).remove([targetPath]).catch(() => {})
    return NextResponse.json(
      { error: `Attachment uploaded pero la fila falló: ${insErr?.message || 'unknown'}` },
      { status: 500 }
    )
  }

  // 5. Cleanup: borrar el original de client-pos. No bloqueante — si falla,
  //    queda como archivo huérfano que se puede limpiar en otro pase.
  await sb.storage
    .from(SOURCE_BUCKET)
    .remove([body.source_path])
    .catch((err) => {
      console.warn('[oc/attach-to-quote] cleanup falló:', err)
    })

  return NextResponse.json({
    ok: true,
    attachment_id: row.id,
    already_existed: false,
  })
}
