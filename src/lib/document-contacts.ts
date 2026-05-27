/**
 * document-contacts.ts
 *
 * Tipos + catálogo de roles para los contactos participantes en un documento
 * (cotización, pedido, albarán, factura). Una empresa cliente tiene muchos
 * contactos (Compras, Usuario técnico, Logística, Finanzas, etc.) y en cada
 * documento se vinculan los que efectivamente están involucrados.
 *
 * Persistencia: `tt_documents.metadata.participating_contacts` (JSONB array).
 * Sin tabla intermedia para evitar otra migración — si después necesitamos
 * queries del tipo "todas las cotizaciones donde X aparece como Compras",
 * armamos una vista o una tabla derivada.
 *
 * Snapshot: guardamos name/email al vincular para que si el contacto se
 * borra después, el documento siga mostrando datos legibles.
 */

export type ParticipantRole =
  | 'compras'
  | 'usuario_tecnico'
  | 'logistica'
  | 'finanzas'
  | 'gerencia'
  | 'firma_autorizada'
  | 'recibe_cotizacion'
  | 'otro'

export interface ParticipantContact {
  contact_id: string
  role: ParticipantRole
  // Snapshot — campos del contacto al momento de vincularlo. Sobreviven al
  // borrado del contacto y a cambios posteriores (auditoría).
  name_snapshot: string
  email_snapshot?: string | null
}

export interface ContactSnippet {
  id: string
  client_id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
  default_roles: string[] | null
  receives_quotes: boolean
  receives_invoices: boolean
  receives_remitos: boolean
}

export const ROLE_OPTIONS: ReadonlyArray<{
  key: ParticipantRole
  label: string
  emoji: string
  description: string
}> = [
  { key: 'compras',           emoji: '🛒', label: 'Compras',             description: 'Firma o gestiona la OC' },
  { key: 'usuario_tecnico',   emoji: '🔧', label: 'Usuario técnico',     description: 'Va a usar el producto' },
  { key: 'logistica',         emoji: '📦', label: 'Logística',           description: 'Recibe el envío' },
  { key: 'finanzas',          emoji: '💰', label: 'Finanzas',            description: 'Aprueba/paga la factura' },
  { key: 'gerencia',          emoji: '👔', label: 'Gerencia',            description: 'Autoriza la compra' },
  { key: 'firma_autorizada',  emoji: '✍️', label: 'Firma autorizada',    description: 'Firma el documento del lado del cliente' },
  { key: 'recibe_cotizacion', emoji: '📧', label: 'Recibe cotización',   description: 'Se le envía el PDF por email/WhatsApp' },
  { key: 'otro',              emoji: '📋', label: 'Otro',                description: '' },
] as const

export const ROLE_LABEL: Record<ParticipantRole, { label: string; emoji: string }> = ROLE_OPTIONS.reduce(
  (acc, r) => ({ ...acc, [r.key]: { label: r.label, emoji: r.emoji } }),
  {} as Record<ParticipantRole, { label: string; emoji: string }>
)

/**
 * Devuelve el nombre visible del cliente como EMPRESA.
 * Prioridad: trade_name → legal_name → name (fallback).
 *
 * El fallback a `name` es defensivo porque hay clientes en la DB con
 * `name = nombre de persona` y `legal_name = empresa` (ej. NORDEX).
 * En esos casos, esta función igual prioriza legal_name.
 */
export function clientCompanyName(client: {
  trade_name?: string | null
  legal_name?: string | null
  name?: string | null
}): string {
  return (
    (client.trade_name && client.trade_name.trim()) ||
    (client.legal_name && client.legal_name.trim()) ||
    (client.name && client.name.trim()) ||
    'Cliente sin nombre'
  )
}

/**
 * Si el `name` del cliente parece nombre de persona y no coincide con
 * legal_name/trade_name, lo devolvemos como subtítulo (probablemente es
 * el contacto principal mal cargado). Heurística simple: dos+ palabras
 * capitalizadas sin números.
 *
 * Sirve para mostrar "NORDEX S.A. — Mariella Acuña" en la cabecera del
 * cliente sin perder esa info histórica.
 */
export function clientLikelyContactName(client: {
  trade_name?: string | null
  legal_name?: string | null
  name?: string | null
}): string | null {
  const name = client.name?.trim() || ''
  if (!name) return null
  // Si name coincide con legal_name o trade_name, no es contacto separado
  if (client.legal_name?.trim() === name || client.trade_name?.trim() === name) return null
  // Heurística: 2+ palabras, sin números, sin abreviaciones S.A./S.R.L./LLC
  const looksLikePerson = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+$/.test(name)
  const looksLikeCompany = /\b(S\.A\.?|S\.R\.L\.?|S\.L\.?|LLC|INC|LTDA?|SOCIEDAD|EMPRESA|GROUP|CO\.?)\b/i.test(name)
  if (looksLikePerson && !looksLikeCompany) return name
  return null
}
