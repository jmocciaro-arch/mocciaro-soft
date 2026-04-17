/**
 * scripts/split-simpa-pdf.ts
 *
 * Divide el PDF unificado de SIMPA en 18 sub-PDFs (uno por Nota de Trabajo),
 * los sube al bucket sat-pdfs y actualiza cada registro en tt_sat_service_history
 * con el PDF que corresponde a su NTT.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
import { resolve } from 'path'
import { PDFDocument } from 'pdf-lib'

config({ path: resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const PDF_PATH = process.env.HOME! + '/Downloads/mantenimiento SIMPA.pdf'

// Rangos de páginas por NTT (1-indexed) según el PDF original
const NTT_RANGES: Array<{ ntt: string; from: number; to: number }> = [
  { ntt: 'NTT00027', from: 1,  to: 2  },
  { ntt: 'NTT00026', from: 3,  to: 4  },
  { ntt: 'NTT00025', from: 5,  to: 5  },
  { ntt: 'NTT00024', from: 6,  to: 6  },
  { ntt: 'NTT00022', from: 7,  to: 7  },
  { ntt: 'NTT00021', from: 8,  to: 9  },
  { ntt: 'NTT00020', from: 10, to: 11 },
  { ntt: 'NTT00019', from: 12, to: 13 },
  { ntt: 'NTT00018', from: 14, to: 15 },
  { ntt: 'NTT00017', from: 16, to: 16 },
  { ntt: 'NTT00015', from: 17, to: 17 },
  { ntt: 'NTT00014', from: 18, to: 19 },
  { ntt: 'NTT00010', from: 20, to: 21 },
  { ntt: 'NTT00009', from: 22, to: 23 },
  { ntt: 'NTT00008', from: 24, to: 24 },
  { ntt: 'NTT00007', from: 25, to: 26 },
  { ntt: 'NTT00006', from: 27, to: 28 },
  { ntt: 'NTT00005', from: 29, to: 30 },
]

async function main() {
  console.log('📖 Leyendo PDF original...')
  const originalBytes = readFileSync(PDF_PATH)
  const originalPdf = await PDFDocument.load(originalBytes)
  console.log(`   ${originalPdf.getPageCount()} páginas totales`)

  const nttToUrl = new Map<string, string>()

  // Cada NTT → sub-PDF → upload
  for (const { ntt, from, to } of NTT_RANGES) {
    const newPdf = await PDFDocument.create()
    const indices = []
    for (let i = from - 1; i <= to - 1; i++) indices.push(i)
    const pages = await newPdf.copyPages(originalPdf, indices)
    pages.forEach((p) => newPdf.addPage(p))
    const bytes = await newPdf.save()

    const path = `simpa/${ntt}.pdf`
    const { error } = await sb.storage.from('sat-pdfs').upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (error) { console.error(`   ❌ ${ntt}: ${error.message}`); continue }
    const { data: urlData } = sb.storage.from('sat-pdfs').getPublicUrl(path)
    nttToUrl.set(ntt, urlData.publicUrl)
    console.log(`   ✓ ${ntt} (${to - from + 1} pág) → ${urlData.publicUrl}`)
  }

  // Actualizar pdf_url en cada registro de histórico
  console.log('\n🔗 Actualizando pdf_url por NTT en tt_sat_service_history...')
  let updated = 0
  for (const [ntt, url] of nttToUrl) {
    const { data, error } = await sb
      .from('tt_sat_service_history')
      .update({ pdf_url: url })
      .eq('ntt_number', ntt)
      .select('id')
    if (error) { console.error(`   ❌ ${ntt}: ${error.message}`); continue }
    const n = (data || []).length
    console.log(`   ${ntt}: ${n} registros actualizados`)
    updated += n
  }

  console.log(`\n✓ Total: ${updated} registros con PDF individual por NTT`)
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1) })
