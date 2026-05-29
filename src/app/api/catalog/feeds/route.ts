/**
 * CRUD de tt_catalog_feeds.
 * GET    /api/catalog/feeds         → list
 * POST   /api/catalog/feeds         → create
 * PATCH  /api/catalog/feeds?id=X    → update
 * DELETE /api/catalog/feeds?id=X    → delete
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const { data, error } = await sb
    .from('tt_catalog_feeds')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feeds: data || [] })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const body = await req.json()
  const token = body.public_token || crypto.randomBytes(16).toString('hex')
  const { data, error } = await sb
    .from('tt_catalog_feeds')
    .insert({
      company_id: body.company_id ?? null,
      name: body.name,
      feed_type: body.feed_type,
      filter: body.filter ?? {},
      field_mapping: body.field_mapping ?? {},
      options: body.options ?? {},
      public_token: token,
      is_public: body.is_public ?? true,
    })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message }, { status: 500 })
  return NextResponse.json({ feed: data })
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const sb = await createClient()
  const body = await req.json()
  const { error } = await sb.from('tt_catalog_feeds').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const sb = await createClient()
  const { error } = await sb.from('tt_catalog_feeds').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
