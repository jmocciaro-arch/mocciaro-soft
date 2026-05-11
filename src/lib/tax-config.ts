/**
 * Tax config resolver — IVA/IRPF/RE por par (cliente, empresa).
 *
 * Resuelve la configuración fiscal a aplicar en cotizaciones y documentos:
 *   1. Si existe override en tt_client_company_tax_config (cliente, empresa) → usar override.
 *   2. Si no → fallback a defaults del cliente (tt_clients.subject_iva, etc.).
 *   3. Si tampoco hay defaults → constantes razonables (IVA 21%, sin retenciones).
 *
 * Usado por:
 *   - src/app/(dashboard)/cotizador/page.tsx
 *   - src/components/workflow/document-form.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type TaxConfig = {
  subject_iva: boolean
  iva_rate: number
  subject_irpf: boolean
  irpf_rate: number
  subject_re: boolean
  re_rate: number
  /** 'override' = vino de tt_client_company_tax_config; 'client_default' = de tt_clients; 'fallback' = sin nada configurado */
  source: 'override' | 'client_default' | 'fallback'
}

const FALLBACK: TaxConfig = {
  subject_iva: true,
  iva_rate: 21,
  subject_irpf: false,
  irpf_rate: 15,
  subject_re: false,
  re_rate: 5.2,
  source: 'fallback',
}

type ClientRow = {
  subject_iva?: boolean | null
  iva_rate?: number | null
  subject_irpf?: boolean | null
  irpf_rate?: number | null
  subject_re?: boolean | null
  re_rate?: number | null
}

type OverrideRow = {
  subject_iva: boolean
  iva_rate: number
  subject_irpf: boolean
  irpf_rate: number
  subject_re: boolean
  re_rate: number
}

/**
 * Resuelve la config fiscal completa para un par (cliente, empresa).
 * Hace 1 sola query a tt_client_company_tax_config y, si no encuentra, otra a tt_clients.
 */
export async function resolveTaxConfig(
  supabase: SupabaseClient,
  clientId: string | null,
  companyId: string | null,
): Promise<TaxConfig> {
  // Sin cliente o sin empresa → defaults razonables
  if (!clientId || !companyId) return { ...FALLBACK }

  // 1. Buscar override por (cliente, empresa)
  const { data: override } = await supabase
    .from('tt_client_company_tax_config')
    .select('subject_iva, iva_rate, subject_irpf, irpf_rate, subject_re, re_rate')
    .eq('client_id', clientId)
    .eq('company_id', companyId)
    .maybeSingle<OverrideRow>()

  if (override) {
    return {
      subject_iva: override.subject_iva,
      iva_rate: Number(override.iva_rate),
      subject_irpf: override.subject_irpf,
      irpf_rate: Number(override.irpf_rate),
      subject_re: override.subject_re,
      re_rate: Number(override.re_rate),
      source: 'override',
    }
  }

  // 2. Fallback a defaults del cliente
  const { data: client } = await supabase
    .from('tt_clients')
    .select('subject_iva, iva_rate, subject_irpf, irpf_rate, subject_re, re_rate')
    .eq('id', clientId)
    .maybeSingle<ClientRow>()

  if (client) {
    return {
      subject_iva: client.subject_iva ?? true,
      iva_rate: client.iva_rate != null ? Number(client.iva_rate) : 21,
      subject_irpf: client.subject_irpf ?? false,
      irpf_rate: client.irpf_rate != null ? Number(client.irpf_rate) : 15,
      subject_re: client.subject_re ?? false,
      re_rate: client.re_rate != null ? Number(client.re_rate) : 5.2,
      source: 'client_default',
    }
  }

  // 3. No hay nada → fallback duro
  return { ...FALLBACK }
}

/**
 * Aplica una config de tax (sin source) sobre un cliente in-memory cuando ya tenés
 * el client row cargado. Útil cuando ya hiciste un select del cliente y querés
 * evitar el roundtrip extra. Igual hace 1 query para chequear el override.
 */
export async function resolveTaxConfigFromClient(
  supabase: SupabaseClient,
  client: ClientRow & { id: string },
  companyId: string | null,
): Promise<TaxConfig> {
  if (!companyId) {
    return {
      subject_iva: client.subject_iva ?? true,
      iva_rate: client.iva_rate != null ? Number(client.iva_rate) : 21,
      subject_irpf: client.subject_irpf ?? false,
      irpf_rate: client.irpf_rate != null ? Number(client.irpf_rate) : 15,
      subject_re: client.subject_re ?? false,
      re_rate: client.re_rate != null ? Number(client.re_rate) : 5.2,
      source: 'client_default',
    }
  }

  const { data: override } = await supabase
    .from('tt_client_company_tax_config')
    .select('subject_iva, iva_rate, subject_irpf, irpf_rate, subject_re, re_rate')
    .eq('client_id', client.id)
    .eq('company_id', companyId)
    .maybeSingle<OverrideRow>()

  if (override) {
    return {
      subject_iva: override.subject_iva,
      iva_rate: Number(override.iva_rate),
      subject_irpf: override.subject_irpf,
      irpf_rate: Number(override.irpf_rate),
      subject_re: override.subject_re,
      re_rate: Number(override.re_rate),
      source: 'override',
    }
  }

  return {
    subject_iva: client.subject_iva ?? true,
    iva_rate: client.iva_rate != null ? Number(client.iva_rate) : 21,
    subject_irpf: client.subject_irpf ?? false,
    irpf_rate: client.irpf_rate != null ? Number(client.irpf_rate) : 15,
    subject_re: client.subject_re ?? false,
    re_rate: client.re_rate != null ? Number(client.re_rate) : 5.2,
    source: 'client_default',
  }
}
