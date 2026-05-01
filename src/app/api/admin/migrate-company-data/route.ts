import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { callClaude } from '@/lib/ai/ai-helper'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/admin/migrate-company-data
 * Body: { companyId?: string, dryRun?: boolean }
 *
 * Migra datos legacy de tt_companies (address único, bank_details textarea)
 * a los campos estructurados nuevos. Usa Claude para parsear direcciones.
 *
 * Si companyId está presente: migra solo esa empresa.
 * Si no: migra todas las que tengan address legacy y campos nuevos vacíos.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, dryRun = false } = body

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // 1) Traer empresas a migrar
    let query = supabase
      .from('tt_companies')
      .select('id, name, country, address, address_street, address_city, iban')
    if (companyId) query = query.eq('id', companyId)
    const { data: companies, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const toMigrate = (companies || []).filter((c: Record<string, unknown>) => {
      const hasLegacy = !!(c.address || c.iban)
      const alreadyMigrated = !!c.address_street || !!c.address_city
      return hasLegacy && !alreadyMigrated
    })

    if (toMigrate.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No hay empresas para migrar',
        migrated: 0,
        total: companies?.length || 0,
      })
    }

    let migrated = 0
    const results: Array<Record<string, unknown>> = []

    for (const c of toMigrate as Array<Record<string, unknown>>) {
      const legacy = (c.address as string) || ''
      const legacyBank = (c.iban as string) || ''
      const country = (c.country as string) || ''

      // Llamar a Claude para parsear
      const prompt = `Parseá esta dirección y datos bancarios legacy en JSON estructurado.

EMPRESA: ${c.name}
PAÍS: ${country}
DIRECCIÓN LEGACY: ${legacy || '(vacío)'}
DATOS BANCARIOS LEGACY: ${legacyBank || '(vacío)'}

Devolvé EXCLUSIVAMENTE JSON con este formato (sin texto extra, sin markdown):
{
  "address": {
    "street": "calle/vía sin número",
    "number": "número (solo dígitos o S/N)",
    "floor": "piso si aparece",
    "apartment": "depto si aparece",
    "postal_code": "código postal",
    "city": "ciudad/localidad",
    "state": "provincia/estado/región",
    "references": "referencias adicionales (km, edificio, sector)"
  },
  "bank": {
    "bank_name": "nombre del banco si aparece",
    "iban": "IBAN si aparece (formato ESxx... o similar)",
    "cbu": "CBU si aparece (22 dígitos)",
    "account_number": "número de cuenta si aparece",
    "swift": "BIC/SWIFT si aparece"
  },
  "confidence": 0.95
}

Si un campo no está claro, dejarlo como string vacío. Para PAÍS=AR usá CBU. Para PAÍS=ES usá IBAN. Para PAÍS=US usá account_number+routing.`

      const aiResult = await callClaude({
        operation: 'company_legacy_parse',
        systemPrompt: 'Sos un experto en parsear datos de empresas latinoamericanas y europeas. Devolvés JSON estricto sin texto extra.',
        userContent: [{ type: 'text', text: prompt }],
        cacheKeyInput: legacy + '||' + legacyBank + '||' + country,
        useCache: true,
        cacheSystemPrompt: true,
      })

      if (!aiResult.data) {
        results.push({ id: c.id, name: c.name, error: aiResult.error || 'IA no respondió' })
        continue
      }

      const jsonMatch = aiResult.data.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        results.push({ id: c.id, name: c.name, error: 'No JSON válido' })
        continue
      }

      let parsed: Record<string, unknown>
      try { parsed = JSON.parse(jsonMatch[0]) } catch (e) {
        results.push({ id: c.id, name: c.name, error: `JSON parse: ${(e as Error).message}` })
        continue
      }

      const addr = (parsed.address || {}) as Record<string, string>
      const bank = (parsed.bank || {}) as Record<string, string>

      const updatePayload: Record<string, unknown> = {
        address_street:      addr.street       || null,
        address_number:      addr.number       || null,
        address_floor:       addr.floor        || null,
        address_apartment:   addr.apartment    || null,
        address_postal_code: addr.postal_code  || null,
        address_city:        addr.city         || null,
        address_state:       addr.state        || null,
        address_references:  addr.references   || null,
      }

      if (!dryRun) {
        await supabase.from('tt_companies').update(updatePayload).eq('id', c.id as string)

        // Si hay datos bancarios, crear cuenta en tt_company_bank_accounts
        const hasBank = bank.iban || bank.cbu || bank.account_number || bank.bank_name
        if (hasBank) {
          const currency = country === 'AR' ? 'ARS' : country === 'ES' ? 'EUR' : country === 'US' ? 'USD' : 'USD'
          await supabase.from('tt_company_bank_accounts').insert({
            company_id:         c.id,
            alias:              `Cuenta migrada (${currency})`,
            bank_name:          bank.bank_name || 'Banco (datos legacy)',
            account_holder:     c.name,
            currency,
            iban:               bank.iban || null,
            cbu:                bank.cbu || null,
            account_number:     bank.account_number || null,
            bic_swift:          bank.swift || null,
            is_default:         true,
            is_active:          true,
            notes:              `Migrado desde datos legacy: ${legacyBank}`,
          })
        }
      }

      results.push({
        id: c.id,
        name: c.name,
        legacy,
        parsed: addr,
        bank,
        confidence: parsed.confidence,
        cost: aiResult.costUsd,
      })
      migrated++
    }

    return NextResponse.json({
      ok: true,
      message: dryRun ? 'Dry run completado (sin guardar)' : `${migrated} empresas migradas`,
      migrated,
      total: toMigrate.length,
      results,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
