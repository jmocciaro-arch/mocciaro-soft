#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key, { auth: { persistSession: false } })

// Supabase JS no expone DDL directo. Usamos rpc si existe, o /pg_dump style.
// Como no tenemos exec, hacemos los ALTER vía postgres direct: usamos pg con DATABASE_URL.
// Plan B: emitir las queries y pedir al user que las aplique.

const queries = [
  `ALTER TABLE public.tt_documents ADD COLUMN IF NOT EXISTS client_po_reference text`,
  `ALTER TABLE public.tt_documents ADD COLUMN IF NOT EXISTS stelorder_id text`,
  `ALTER TABLE public.tt_documents ADD COLUMN IF NOT EXISTS stelorder_pdf_url text`,
  `ALTER TABLE public.tt_document_lines ADD COLUMN IF NOT EXISTS stelorder_id text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tt_documents_stelorder_id_key ON public.tt_documents (stelorder_id) WHERE stelorder_id IS NOT NULL`,
]

console.log('SQL a aplicar:\n' + queries.join(';\n') + ';')
