#!/usr/bin/env tsx
/**
 * Script directo de migración StelOrder — sin pasar por HTTP del dev server.
 * Corre todas las fases críticas en orden con logging visible.
 *
 * Uso: source .env.local; npx tsx scripts/migrate-stelorder.ts <companyId> [phase1 phase2 ...]
 */

import { createClient } from '@supabase/supabase-js'
import { StelOrderClient } from '../src/lib/migration/stelorder-client'
import { PHASES } from '../src/lib/migration/stelorder-phases'

async function main() {
  const companyId = process.argv[2]
  const requestedPhases = process.argv.slice(3)
  if (!companyId) {
    console.error('Uso: npx tsx scripts/migrate-stelorder.ts <companyId> [phase1 ...]')
    process.exit(1)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const apiKey = process.env.STELORDER_APIKEY_TORQUETOOLS!
  if (!url || !key || !apiKey) {
    console.error('Faltan envs: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STELORDER_APIKEY_TORQUETOOLS')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const stel = new StelOrderClient({
    apiKey,
    onRequest: (endpoint) => console.log(`  ↳ GET ${endpoint}`),
  })

  // Fases por default: todas las criticas en orden
  const DEFAULT_PHASES = [
    '1a_warehouses', '2a_suppliers', '2c_clients', '2d_contacts',
    '3a_products', '3b_services',
  ]
  const phaseIds = requestedPhases.length > 0 ? requestedPhases : DEFAULT_PHASES

  for (const phaseId of phaseIds) {
    const phase = PHASES.find((p) => p.id === phaseId)
    if (!phase) {
      console.log(`⚠️  Fase no encontrada: ${phaseId}`)
      continue
    }
    console.log(`\n━━━ ${phaseId} (${phase.label}) ━━━`)
    const t0 = Date.now()
    try {
      const result = await phase.fn({
        stel,
        supabase: supabase as any,
        companyId,
        onProgress: (p: number, t: number) => process.stdout.write(`\r  ${p}/${t}`),
      } as any)
      console.log(`\n  ✓ processed=${result.processed} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} errors=${result.errors} (${Date.now() - t0}ms)`)
      if (result.errors > 0 && result.errorLog?.length) {
        console.log(`    Primer error: ${result.errorLog[0].error.slice(0, 200)}`)
      }
    } catch (err) {
      console.error(`\n  ✗ ${(err as Error).message}`)
    }
  }
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1) })
