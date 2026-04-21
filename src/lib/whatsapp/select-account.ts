// ============================================================================
// Helper para seleccionar la cuenta WhatsApp correcta segun empresa.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhatsAppAccount } from './types'

/**
 * Devuelve la cuenta por defecto activa de la empresa. Si se pasa un
 * account_id especifico, busca esa. Null si no existe ninguna activa.
 */
export async function selectAccount(
  supabase: SupabaseClient,
  params: { company_id: string; account_id?: string },
): Promise<WhatsAppAccount | null> {
  if (params.account_id) {
    const { data } = await supabase
      .from('tt_company_whatsapp_accounts')
      .select('*')
      .eq('id', params.account_id)
      .eq('company_id', params.company_id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    return (data as WhatsAppAccount) || null
  }

  // Default de la empresa: is_default=true primero, sino la mas antigua activa
  const { data } = await supabase
    .from('tt_company_whatsapp_accounts')
    .select('*')
    .eq('company_id', params.company_id)
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)

  return ((data && data[0]) as WhatsAppAccount) || null
}

/**
 * Busca la cuenta por su webhook_path (usado en el endpoint publico).
 */
export async function findAccountByWebhookPath(
  supabase: SupabaseClient,
  webhookPath: string,
): Promise<WhatsAppAccount | null> {
  const { data } = await supabase
    .from('tt_company_whatsapp_accounts')
    .select('*')
    .eq('webhook_path', webhookPath)
    .limit(1)
    .maybeSingle()
  return (data as WhatsAppAccount) || null
}
