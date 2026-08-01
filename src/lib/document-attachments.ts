/**
 * DOCUMENT ATTACHMENTS
 *
 * Capa de datos para los archivos adjuntos por documento (OC original,
 * pliegos, especificaciones, planos, fotos, etc.).
 *
 * Soporta dos tipos de adjunto:
 *   1. Archivo subido al bucket "document-attachments" de Supabase Storage
 *   2. Link externo (Google Drive, Dropbox, OneDrive) — para archivos grandes
 */

import { createClient } from '@/lib/supabase/client'

export type AttachmentDocType =
  | 'quote'
  | 'sales_order'
  | 'delivery_note'
  | 'invoice'
  | 'credit_note'
  | 'purchase_order'
  | 'purchase_invoice'
  | 'client_po'
  | 'opportunity'
  | 'lead'
  | 'sat_ticket'
  | 'process_instance'
  | 'workflow_node'

export type AttachmentCategory =
  | 'oc_cliente'
  | 'pliego'
  | 'especificaciones'
  | 'plano'
  | 'foto'
  | 'email'
  | 'firma'
  | 'otro'

export interface DocumentAttachment {
  id: string
  document_id: string
  document_type: AttachmentDocType
  category: AttachmentCategory
  name: string
  description: string | null
  mime_type: string | null
  size_bytes: number | null
  storage_path: string | null
  external_url: string | null
  uploaded_by_user_id: string | null
  created_at: string
  /**
   * Cuando el adjunto viene "heredado" de un documento ancestro en la
   * cadena (ej. la OC del cliente adjuntada a la cotización, vista desde
   * el pedido/albarán/factura derivados) — null si es un adjunto propio
   * de este documento. Ver listAttachmentsWithAncestors().
   */
  inherited_from?: { system_code: string | null; doc_type: string } | null
}

const BUCKET = 'document-attachments'

function docTypeToAttachmentType(docType: string): AttachmentDocType {
  const t = (docType || '').toLowerCase()
  if (t === 'coti' || t === 'presupuesto' || t === 'quote' || t === 'cotizacion') return 'quote'
  if (t === 'pedido' || t === 'sales_order') return 'sales_order'
  if (t === 'delivery_note' || t === 'albaran' || t === 'remito') return 'delivery_note'
  if (t === 'factura' || t === 'invoice') return 'invoice'
  if (t === 'credit_note' || t === 'factura_abono' || t === 'nota_credito') return 'credit_note'
  if (t === 'pap' || t === 'purchase_order' || t === 'orden_compra') return 'purchase_order'
  if (t === 'factura_compra' || t === 'purchase_invoice') return 'purchase_invoice'
  if (t === 'client_po') return 'client_po'
  return 'quote'
}

// =====================================================
// LISTAR
// =====================================================
export async function listAttachments(
  documentType: AttachmentDocType,
  documentId: string,
): Promise<DocumentAttachment[]> {
  const sb = createClient()
  const { data, error } = await sb
    .from('tt_document_attachments')
    .select('*')
    .eq('document_type', documentType)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as DocumentAttachment[] | null) ?? []
}

/**
 * Igual que listAttachments(), pero además trae los adjuntos de los
 * documentos ANCESTROS en la cadena (cotización → pedido → albarán →
 * factura, vía tt_document_relations), marcados con `inherited_from`.
 *
 * Por qué existe: la OC del cliente se adjunta una sola vez, a la
 * cotización (vía /api/oc/attach-to-quote). Sin esto, abrir el pedido o
 * la factura derivados nunca la mostraba — daba la impresión de que
 * "no se adjuntó", cuando en realidad estaba un escalón más arriba en
 * la cadena. Tope de 6 saltos para no armar un loop infinito ante datos
 * corruptos (ciclos no deberían existir, pero por las dudas).
 */
export async function listAttachmentsWithAncestors(
  documentType: AttachmentDocType,
  documentId: string,
): Promise<DocumentAttachment[]> {
  const own = await listAttachments(documentType, documentId)

  const sb = createClient()
  const inherited: DocumentAttachment[] = []
  const seenDocIds = new Set<string>([documentId])
  let currentId = documentId

  for (let hop = 0; hop < 6; hop++) {
    const { data: link } = await sb
      .from('tt_document_relations')
      .select('parent_id, tt_documents:parent_id (id, system_code, doc_type)')
      .eq('child_id', currentId)
      .limit(1)
      .maybeSingle()

    const parent = (link as unknown as { tt_documents?: { id: string; system_code: string | null; doc_type: string } } | null)?.tt_documents
    if (!parent || seenDocIds.has(parent.id)) break
    seenDocIds.add(parent.id)

    const parentAttType = docTypeToAttachmentType(parent.doc_type)
    const parentAttachments = await listAttachments(parentAttType, parent.id)
    for (const att of parentAttachments) {
      inherited.push({ ...att, inherited_from: { system_code: parent.system_code, doc_type: parent.doc_type } })
    }

    currentId = parent.id
  }

  return [...own, ...inherited]
}

// =====================================================
// SUBIR ARCHIVO
// =====================================================
export async function uploadAttachment(input: {
  file: File
  documentType: AttachmentDocType
  documentId: string
  category: AttachmentCategory
  description?: string
  uploadedBy?: string
}): Promise<DocumentAttachment> {
  const sb = createClient()

  // Path: <type>/<docId>/<timestamp>-<sanitized_name>
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${input.documentType}/${input.documentId}/${Date.now()}-${safeName}`

  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data: row, error } = await sb
    .from('tt_document_attachments')
    .insert({
      document_id: input.documentId,
      document_type: input.documentType,
      category: input.category,
      name: input.file.name,
      description: input.description ?? null,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      storage_path: path,
      uploaded_by_user_id: input.uploadedBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error

  return row as DocumentAttachment
}

// =====================================================
// AGREGAR LINK EXTERNO (Drive / Dropbox)
// =====================================================
export async function addExternalLink(input: {
  documentType: AttachmentDocType
  documentId: string
  category: AttachmentCategory
  name: string
  url: string
  description?: string
  uploadedBy?: string
}): Promise<DocumentAttachment> {
  const sb = createClient()
  const { data: row, error } = await sb
    .from('tt_document_attachments')
    .insert({
      document_id: input.documentId,
      document_type: input.documentType,
      category: input.category,
      name: input.name,
      description: input.description ?? null,
      external_url: input.url,
      mime_type: 'application/external-link',
      uploaded_by_user_id: input.uploadedBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return row as DocumentAttachment
}

// =====================================================
// OBTENER URL PARA DESCARGAR / VER
// =====================================================
export async function getAttachmentUrl(att: DocumentAttachment): Promise<string> {
  if (att.external_url) return att.external_url
  if (!att.storage_path) throw new Error('Adjunto sin archivo ni link')

  const sb = createClient()
  // Signed URL válida por 1h
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(att.storage_path, 3600)
  if (error || !data) throw error || new Error('No se pudo generar URL')
  return data.signedUrl
}

// =====================================================
// ELIMINAR
// =====================================================
export async function deleteAttachment(att: DocumentAttachment): Promise<void> {
  const sb = createClient()
  // Borrar del bucket si era subido
  if (att.storage_path) {
    await sb.storage.from(BUCKET).remove([att.storage_path]).catch(() => {
      // si falla el storage no abortamos — borramos igual la fila
    })
  }
  const { error } = await sb.from('tt_document_attachments').delete().eq('id', att.id)
  if (error) throw error
}

// =====================================================
// HELPERS
// =====================================================

export const CATEGORY_LABELS: Record<AttachmentCategory, { label: string; emoji: string; color: string }> = {
  oc_cliente:       { label: 'OC del cliente',  emoji: '📋', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  pliego:           { label: 'Pliego',          emoji: '📑', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  especificaciones: { label: 'Especificaciones', emoji: '📐', color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  plano:            { label: 'Plano',           emoji: '📊', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  foto:             { label: 'Foto',            emoji: '📷', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  email:            { label: 'Email',           emoji: '📧', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  firma:            { label: 'Firma',           emoji: '✍️', color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  otro:             { label: 'Otro',            emoji: '📎', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30' },
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/')
}

export function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf'
}
