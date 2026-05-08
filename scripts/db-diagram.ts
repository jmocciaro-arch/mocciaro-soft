#!/usr/bin/env tsx
/**
 * Generador de ER diagram en formato DBML — Fase 0.3 del PLAN-REFACTOR.
 *
 * Lee el schema de Supabase via information_schema y genera un archivo
 * DBML (https://dbml.dbdiagram.io/home/) que puede:
 *   - Importarse directamente a https://dbdiagram.io para visualizar.
 *   - Convertirse a SVG con `dbml-renderer` (npm).
 *   - Pegarse en CLAUDE Markdown directamente (renderiza como código).
 *
 * Output: /docs/diagrams/er-current.dbml
 *
 * REQUIERE en .env.local:
 *   SUPABASE_URL                — proyecto a inspeccionar
 *   SUPABASE_SERVICE_ROLE_KEY   — para acceder a information_schema
 *
 * USO:
 *   npm run db:diagram
 *
 * Filtra solo tablas que arrancan con `tt_` (las del producto).
 *
 * NOTA: este es un esqueleto que genera un DBML mínimo (tablas + columnas
 * + tipos). NO infiere foreign keys (eso requiere consultar también
 * information_schema.referential_constraints + key_column_usage —
 * agregar en iteración siguiente cuando tengas DB de staging).
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const OUTPUT_PATH = resolve(__dirname, '..', 'docs', 'diagrams', 'er-current.dbml')

interface Column {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  console.log('📊 Inspeccionando schema...')

  // Tabla 'columns' del schema 'public', solo tablas tt_*
  const { data, error } = await sb.rpc('get_tt_columns_for_diagram')

  // Si la RPC no existe, fallback: query directa via REST (PostgREST puede no
  // exponer information_schema). En ese caso, usar pg_dump local.
  if (error) {
    console.error('❌ RPC get_tt_columns_for_diagram no existe.')
    console.error('   Crear esta función SQL en Supabase para que el script funcione:')
    console.error('')
    console.error('   CREATE OR REPLACE FUNCTION get_tt_columns_for_diagram()')
    console.error('   RETURNS TABLE(table_name text, column_name text, data_type text,')
    console.error('                 is_nullable text, column_default text)')
    console.error('   LANGUAGE sql SECURITY DEFINER AS $$')
    console.error('     SELECT table_name, column_name, data_type, is_nullable, column_default')
    console.error('     FROM information_schema.columns')
    console.error("     WHERE table_schema = 'public' AND table_name LIKE 'tt\\_%'")
    console.error('     ORDER BY table_name, ordinal_position;')
    console.error('   $$;')
    console.error('')
    console.error('   Alternativa: pg_dump --schema-only | filtrar tablas tt_*.')
    process.exit(2)
  }

  const cols = (Array.isArray(data) ? data : []) as Column[]
  cols.sort((a, b) => a.table_name.localeCompare(b.table_name))
  console.log(`✓ ${cols.length} columnas en ${new Set(cols.map((c) => c.table_name)).size} tablas tt_*`)

  // Generar DBML
  const byTable = new Map<string, Column[]>()
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, [])
    byTable.get(c.table_name)!.push(c)
  }

  const lines: string[] = [
    `// Mocciaro Soft V001 — schema actual`,
    `// Generado: ${new Date().toISOString()}`,
    `// Importar a https://dbdiagram.io o renderizar con dbml-renderer.`,
    ``,
  ]

  for (const [table, columns] of [...byTable.entries()].sort()) {
    lines.push(`Table ${table} {`)
    for (const c of columns) {
      const dbmlType = mapToDbmlType(c.data_type)
      const flags: string[] = []
      if (c.is_nullable === 'NO') flags.push('not null')
      if (c.column_name === 'id') flags.push('pk')
      if (c.column_default?.includes('uuid_generate_v4') || c.column_default?.includes('gen_random_uuid')) {
        flags.push('default: `gen_random_uuid()`')
      } else if (c.column_default && c.column_default !== 'NULL') {
        const def = c.column_default.replace(/::[a-z_]+$/i, '').slice(0, 40)
        flags.push(`default: \`${def}\``)
      }
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
      lines.push(`  ${c.column_name} ${dbmlType}${flagStr}`)
    }
    lines.push(`}`)
    lines.push(``)
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, lines.join('\n'))
  console.log(`✅ DBML generado: ${OUTPUT_PATH}`)
  console.log(`   Importá a https://dbdiagram.io para visualizar.`)
}

function mapToDbmlType(pgType: string): string {
  // PostgreSQL → DBML compatible types
  const t = pgType.toLowerCase()
  if (t === 'uuid') return 'uuid'
  if (t === 'text' || t === 'character varying') return 'text'
  if (t === 'integer' || t === 'bigint' || t === 'smallint') return 'int'
  if (t === 'numeric' || t === 'real' || t === 'double precision') return 'numeric'
  if (t === 'boolean') return 'bool'
  if (t.includes('timestamp')) return 'timestamptz'
  if (t === 'date') return 'date'
  if (t === 'jsonb' || t === 'json') return 'jsonb'
  if (t === 'bytea') return 'bytea'
  if (t.includes('array') || t.endsWith('[]')) return 'text' // simplificación
  return 'text'
}

main().catch((err: Error) => {
  console.error('❌ db-diagram falló:', err.message)
  process.exit(1)
})
