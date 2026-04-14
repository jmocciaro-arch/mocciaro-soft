import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aiQuery, type AIProvider } from '@/lib/ai'
import { searchContactsByDomain, isGmailConnected } from '@/lib/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// =====================================================
// AI EXECUTE API — Runs AI-powered actions on the system
// =====================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, params, provider = 'gemini' } = body as {
      action: string
      params: Record<string, unknown>
      provider?: AIProvider
    }

    switch (action) {
      case 'sync_contacts':
        return await syncContacts(params, provider)
      case 'query':
        return await querySystem(params, provider)
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// =====================================================
// ACTION: sync_contacts — Search emails and extract contacts
// =====================================================

async function syncContacts(params: Record<string, unknown>, provider: AIProvider) {
  const clientId = params.client_id as string
  const domain = params.domain as string

  if (!clientId || !domain) {
    return NextResponse.json({ error: 'client_id and domain required' }, { status: 400 })
  }

  // 1. Get client info
  const { data: client } = await supabase
    .from('tt_clients')
    .select('id, name, email')
    .eq('id', clientId)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // 2. Get existing contacts to avoid dupes
  const { data: existingContacts } = await supabase
    .from('tt_client_contacts')
    .select('name, email')
    .eq('client_id', clientId)

  const existingEmails = new Set(
    (existingContacts || []).map(c => (c.email as string || '').toLowerCase())
  )

  // 3. Search Gmail for real contacts
  let gmailContacts: Array<{ name: string; email: string; position: string }> = []
  let source = 'ai'

  if (isGmailConnected()) {
    try {
      gmailContacts = await searchContactsByDomain(domain)
      source = 'gmail'
    } catch (err) {
      // Gmail search failed, fall back to AI
      console.error('Gmail search failed:', (err as Error).message)
    }
  }

  // 4. If Gmail found contacts, use them. Otherwise fall back to AI
  let allContacts = gmailContacts
  if (allContacts.length === 0) {
    // Fallback: Ask AI to suggest contacts
    const systemPrompt = `Sos un asistente de CRM. Dado un dominio de email de un cliente, generá contactos probables con formato JSON.
Respondé SOLO con un JSON array. Cada contacto: name, email, position.`
    const userPrompt = `Cliente: ${client.name}\nDominio: @${domain}\nExistentes: ${JSON.stringify(existingContacts || [])}\nGenera contactos adicionales. Solo JSON array.`
    try {
      const result = await aiQuery(systemPrompt, userPrompt, provider)
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) allContacts = JSON.parse(jsonMatch[0])
      source = 'ai'
    } catch { /* AI also failed */ }
  }

  // 5. Use AI to enrich contacts that have raw signatures but missing data
  const contactsWithSignatures = allContacts.filter(
    (c) => 'raw_signature' in c && (c as any).raw_signature && (!(c as any).position || !(c as any).phone)
  )
  if (contactsWithSignatures.length > 0) {
    try {
      const sigData = contactsWithSignatures.map(c => ({
        email: c.email,
        name: c.name,
        signature: (c as any).raw_signature?.slice(0, 300) || '',
      }))
      const aiResult = await aiQuery(
        `Extraé datos de contacto de estas firmas de email. Respondé SOLO con un JSON array.
Cada item: { "email": "...", "position": "cargo", "phone": "telefono", "whatsapp": "numero" }.
Si no encontrás un dato, dejalo como string vacío. No inventes datos.`,
        JSON.stringify(sigData),
        provider
      )
      const jsonMatch = aiResult.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const enriched: Array<{ email: string; position: string; phone: string; whatsapp: string }> = JSON.parse(jsonMatch[0])
        for (const e of enriched) {
          const contact = allContacts.find(c => c.email === e.email)
          if (contact) {
            if (e.position && !contact.position) contact.position = e.position
            if (e.phone && !(contact as any).phone) (contact as any).phone = e.phone
            if (e.whatsapp && !(contact as any).whatsapp) (contact as any).whatsapp = e.whatsapp
          }
        }
      }
    } catch { /* AI enrichment failed, continue with regex data */ }
  }

  // 6. Filter out existing contacts
  const newContacts = allContacts.filter(
    c => c.email && !existingEmails.has(c.email.toLowerCase())
  )

  // 7. Also update existing contacts with new data (phone, position, whatsapp)
  let updated = 0
  for (const contact of allContacts) {
    if (!existingEmails.has(contact.email.toLowerCase())) continue
    const phone = (contact as any).phone || ''
    const position = contact.position || ''
    const whatsapp = (contact as any).whatsapp || ''
    if (!phone && !position && !whatsapp) continue

    const updates: Record<string, unknown> = {}
    if (position) updates.position = position
    if (phone) updates.phone = phone
    if (whatsapp) updates.whatsapp = whatsapp

    const { error } = await supabase.from('tt_client_contacts')
      .update(updates)
      .eq('client_id', clientId)
      .eq('email', contact.email.toLowerCase())
    if (!error) updated++
  }

  // 8. Insert new contacts
  let added = 0
  for (const contact of newContacts) {
    const { error } = await supabase.from('tt_client_contacts').insert({
      client_id: clientId,
      name: contact.name,
      email: contact.email.toLowerCase(),
      position: contact.position || null,
      phone: (contact as any).phone || null,
      whatsapp: (contact as any).whatsapp || null,
      is_primary: false,
    })
    if (!error) added++
  }

  // 9. Update client email_domain
  await supabase
    .from('tt_clients')
    .update({ email_domain: domain.toLowerCase() })
    .eq('id', clientId)

  return NextResponse.json({
    success: true,
    client: client.name,
    domain,
    source,
    contacts_found: allContacts.length,
    contacts_added: added,
    contacts_updated: updated,
    contacts_skipped: allContacts.length - added - updated,
    provider,
    contacts: newContacts.map(c => ({
      name: c.name,
      email: c.email,
      position: c.position,
      phone: (c as any).phone || '',
      whatsapp: (c as any).whatsapp || '',
    })),
  })
}

// =====================================================
// ACTION: query — Ask AI about system data
// =====================================================

async function querySystem(params: Record<string, unknown>, provider: AIProvider) {
  const question = params.question as string
  if (!question) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }

  // Get some context from the DB
  const [{ count: clientCount }, { count: ticketCount }] = await Promise.all([
    supabase.from('tt_clients').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('tt_sat_tickets').select('id', { count: 'exact', head: true }),
  ])

  const systemPrompt = `Sos el asistente IA de Mocciaro Soft, un sistema ERP/CRM para Torquetools (trader de herramientas industriales).

Datos del sistema:
- ${clientCount || 0} clientes activos
- ${ticketCount || 0} tickets SAT
- Monedas: EUR, USD, ARS
- Marcas: FEIN, Tohnichi, Tecna, Ingersoll Rand, FIAM, Apex

Respondé en español rioplatense, de forma concisa y útil.`

  const result = await aiQuery(systemPrompt, question, provider)

  return NextResponse.json({
    answer: result,
    provider,
  })
}
