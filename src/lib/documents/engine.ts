import { getAdminClient } from '@/lib/supabase/admin'
import {
  canDerive,
  canTransition,
  DOC_TYPE_DIRECTION,
  type DocStatus,
  type DocType,
  type RelationType,
} from '@/lib/schemas/documents'

type Admin = ReturnType<typeof getAdminClient>

// -----------------------------------------------------------------------------
// addEvent — registra un evento de trazabilidad (INSERT directo).
// Los INSERTs a tt_document_events siguen permitidos; UPDATE/DELETE están
// bloqueados a nivel DB por trigger y policy (v38).
// -----------------------------------------------------------------------------
export async function addEvent(
  admin: Admin,
  args: {
    documentId: string
    eventType: string
    actorId?: string | null
    fromStatus?: DocStatus | null
    toStatus?: DocStatus | null
    relatedDocumentId?: string | null
    payload?: Record<string, unknown>
    notes?: string | null
  }
) {
  return admin.from('tt_document_events').insert({
    document_id: args.documentId,
    event_type: args.eventType,
    actor_id: args.actorId ?? null,
    from_status: args.fromStatus ?? null,
    to_status: args.toStatus ?? null,
    related_document_id: args.relatedDocumentId ?? null,
    payload: args.payload ?? {},
    notes: args.notes ?? null,
  })
}

// -----------------------------------------------------------------------------
// issueDocument — delega en fn_issue_document (SQL, atómico).
// El RPC hace: SELECT ... FOR UPDATE, numeración atómica, render del code,
// update del doc y eventos issued + numbered, todo en una transacción.
// -----------------------------------------------------------------------------
export async function issueDocument(args: {
  documentId: string
  actorId: string
  docDate?: string
}): Promise<
  | { ok: true; number: number; code: string; year: number }
  | { ok: false; status: number; error: string }
> {
  const admin = getAdminClient()
  const { data, error } = await admin.rpc('fn_issue_document', {
    p_document_id: args.documentId,
    p_actor_id: args.actorId,
    p_doc_date: args.docDate ?? null,
  })

  if (error) return { ok: false, status: mapPgErrorToHttp(error), error: error.message }
  if (!data) return { ok: false, status: 500, error: 'fn_issue_document no retornó datos' }

  const result = data as { document_id: string; number: number; year: number; code: string }
  return { ok: true, number: Number(result.number), code: result.code, year: Number(result.year) }
}

// -----------------------------------------------------------------------------
// transitionStatus — cambio de status con validación de transición permitida.
// No usa RPC porque es una operación simple sin concurrencia crítica.
// El locking opcional del doc lo hace el UPDATE ... WHERE id=... que es atómico por fila.
// -----------------------------------------------------------------------------
export async function transitionStatus(args: {
  documentId: string
  toStatus: DocStatus
  actorId: string
  notes?: string
  payload?: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = getAdminClient()
  const { data: doc, error } = await admin
    .from('tt_documents')
    .select('id, status')
    .eq('id', args.documentId)
    .single()
  if (error || !doc) return { ok: false, status: 404, error: 'Documento no encontrado' }

  const from = doc.status as DocStatus
  if (!canTransition(from, args.toStatus)) {
    return { ok: false, status: 409, error: `Transición no permitida: ${from} → ${args.toStatus}` }
  }

  const patch: Record<string, unknown> = { status: args.toStatus, updated_by: args.actorId }
  if (args.toStatus === 'cancelled') {
    patch.cancelled_at = new Date().toISOString()
    patch.cancelled_reason = args.notes ?? null
  }

  const { error: upErr } = await admin.from('tt_documents').update(patch).eq('id', args.documentId)
  if (upErr) return { ok: false, status: 500, error: upErr.message }

  await addEvent(admin, {
    documentId: args.documentId,
    eventType: 'status_changed',
    actorId: args.actorId,
    fromStatus: from,
    toStatus: args.toStatus,
    notes: args.notes,
    payload: args.payload,
  })
  return { ok: true }
}

// -----------------------------------------------------------------------------
// deriveDocument — delega en fn_derive_document (SQL, atómico).
// Resuelve relation_type + remainder_field en TS, el RPC hace:
//   SELECT ... FOR UPDATE sobre líneas, validación, copy, update de
//   remainders, relation, eventos y auto-transition — todo en 1 tx.
// -----------------------------------------------------------------------------
export async function deriveDocument(args: {
  sourceDocumentId: string
  targetType: DocType
  mode: 'full' | 'selected'
  lineIds?: string[]
  lineQuantities?: Record<string, number>
  copyCounterparty?: boolean
  actorId: string
  notes?: string
}): Promise<
  | { ok: true; documentId: string; relation: RelationType; linesCopied: number }
  | { ok: false; status: number; error: string }
> {
  const admin = getAdminClient()

  // Lookup del tipo origen para resolver relation + remainder field sin round-trip extra
  const { data: src, error: srcErr } = await admin
    .from('tt_documents')
    .select('doc_type')
    .eq('id', args.sourceDocumentId)
    .maybeSingle()
  if (srcErr) return { ok: false, status: 500, error: srcErr.message }
  if (!src) return { ok: false, status: 404, error: 'Documento origen no encontrado' }

  const check = canDerive(src.doc_type as DocType, args.targetType)
  if (!check.ok) return { ok: false, status: 400, error: check.reason }

  const remainderField =
    args.targetType === 'delivery_note' ? 'quantity_delivered'
    : args.targetType === 'invoice'     ? 'quantity_invoiced'
    : null

  const { data, error } = await admin.rpc('fn_derive_document', {
    p_source_id:         args.sourceDocumentId,
    p_target_type:       args.targetType,
    p_relation_type:     check.relation,
    p_remainder_field:   remainderField,
    p_direction:         DOC_TYPE_DIRECTION[args.targetType],
    p_mode:              args.mode,
    p_line_ids:          args.lineIds ?? null,
    p_line_quantities:   args.lineQuantities ?? null,
    p_copy_counterparty: args.copyCounterparty ?? true,
    p_notes:             args.notes ?? null,
    p_actor_id:          args.actorId,
  })

  if (error) return { ok: false, status: mapPgErrorToHttp(error), error: error.message }
  if (!data) return { ok: false, status: 500, error: 'fn_derive_document no retornó datos' }

  const result = data as { document_id: string; relation: RelationType; lines_copied: number }
  return {
    ok: true,
    documentId: result.document_id,
    relation: result.relation,
    linesCopied: Number(result.lines_copied),
  }
}

// -----------------------------------------------------------------------------
// Mapeo de errores de Postgres a HTTP
// -----------------------------------------------------------------------------
function mapPgErrorToHttp(err: { code?: string | null; message?: string | null }): number {
  switch (err.code) {
    case 'no_data_found':         return 404  // P0002
    case '23505':                 return 409  // unique_violation
    case '23503':                 return 409  // foreign_key_violation
    case '23514':                 return 400  // check_violation
    case 'insufficient_privilege':return 403  // 42501
    default:                      return 500
  }
}
