import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/require-admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*'
  let pw = ''
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pw
}

// POST: Create auth user + tt_users record
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const body = await req.json()
    const { username, full_name, email, role, gmail, whatsapp, phone, company_id, active, permissions } = body

    if (!email || !full_name || !username) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: email, full_name, username' }, { status: 400 })
    }

    const admin = getAdminClient()
    const password = generatePassword()

    // 1. Create Supabase Auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: role || 'viewer' },
    })

    if (authError) {
      return NextResponse.json({ error: `Error creando usuario auth: ${authError.message}` }, { status: 400 })
    }

    const authId = authData.user?.id

    // 2. Insert into tt_users
    const { data: userData, error: dbError } = await admin
      .from('tt_users')
      .insert({
        auth_id: authId || null,
        username,
        full_name,
        email,
        gmail: gmail || null,
        whatsapp: whatsapp || null,
        phone: phone || null,
        role: role || 'viewer',
        company_id: company_id || null,
        active: active !== false,
        permissions: permissions || {},
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: `Error insertando en tt_users: ${dbError.message}`, auth_id: authId }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      user: userData,
      auth_id: authId,
      generated_password: password,
    })
  } catch (err) {
    return NextResponse.json({ error: `Error inesperado: ${(err as Error).message}` }, { status: 500 })
  }
}

// PUT: Update tt_users record
export async function PUT(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Falta el ID del usuario' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Build update object filtering out undefined values
    const updateData: Record<string, unknown> = {}
    const fields = ['username', 'full_name', 'email', 'gmail', 'whatsapp', 'phone', 'role', 'company_id', 'active']
    for (const f of fields) {
      if (updates[f] !== undefined) {
        updateData[f] = updates[f]
      }
    }

    // Merge permissions JSONB: read existing, layer updates on top.
    // Granular fields (specialties, company_ids, email_personal, whatsapp_empresa) live inside permissions.
    const permissionFields = ['specialties', 'company_ids', 'email_personal', 'whatsapp_empresa']
    const hasPermissionUpdate = updates.permissions !== undefined || permissionFields.some(f => updates[f] !== undefined)
    if (hasPermissionUpdate) {
      const { data: current } = await admin
        .from('tt_users')
        .select('permissions')
        .eq('id', id)
        .single()
      const existingPerms = (current?.permissions as Record<string, unknown>) || {}
      const incomingPerms = (updates.permissions as Record<string, unknown>) || {}
      const merged: Record<string, unknown> = { ...existingPerms, ...incomingPerms }
      for (const f of permissionFields) {
        if (updates[f] !== undefined) merged[f] = updates[f]
      }
      updateData.permissions = merged
    }

    // Mirror first company_id into the legacy single-company column for compatibility
    if (Array.isArray(updates.company_ids)) {
      updateData.company_id = updates.company_ids[0] || null
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await admin
      .from('tt_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: `Error actualizando usuario: ${error.message}` }, { status: 400 })
    }

    // If role changed and user has auth_id, update auth user metadata
    if (updates.role && data?.auth_id) {
      await admin.auth.admin.updateUserById(data.auth_id as string, {
        user_metadata: { full_name: data.full_name, role: updates.role },
      })
    }

    return NextResponse.json({ success: true, user: data })
  } catch (err) {
    return NextResponse.json({ error: `Error inesperado: ${(err as Error).message}` }, { status: 500 })
  }
}

// PATCH: Reset/set a user's password in Supabase Auth
export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const body = await req.json()
    const { id, password: customPassword } = body

    if (!id) {
      return NextResponse.json({ error: 'Falta el ID del usuario' }, { status: 400 })
    }

    if (customPassword !== undefined && String(customPassword).length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Look up the auth_id for this tt_users record
    const { data: userRow, error: lookupError } = await admin
      .from('tt_users')
      .select('auth_id, email')
      .eq('id', id)
      .single()

    if (lookupError || !userRow) {
      return NextResponse.json({ error: 'No se encontró el usuario' }, { status: 404 })
    }

    if (!userRow.auth_id) {
      return NextResponse.json({ error: 'El usuario no tiene cuenta de autenticación asociada' }, { status: 400 })
    }

    const password = customPassword || generatePassword()

    const { error: authError } = await admin.auth.admin.updateUserById(userRow.auth_id as string, {
      password,
    })

    if (authError) {
      return NextResponse.json({ error: `Error actualizando contraseña: ${authError.message}` }, { status: 400 })
    }

    // Touch updated_at so the list reflects the change
    await admin
      .from('tt_users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      // Only return the password when we generated it (so the admin can copy it)
      generated_password: customPassword ? null : password,
    })
  } catch (err) {
    return NextResponse.json({ error: `Error inesperado: ${(err as Error).message}` }, { status: 500 })
  }
}

// DELETE: Deactivate user (set active=false)
export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireAdmin()
    if (!guard.ok) return guard.response

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Falta el ID del usuario' }, { status: 400 })
    }

    const admin = getAdminClient()

    const { data, error } = await admin
      .from('tt_users')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: `Error desactivando usuario: ${error.message}` }, { status: 400 })
    }

    return NextResponse.json({ success: true, user: data })
  } catch (err) {
    return NextResponse.json({ error: `Error inesperado: ${(err as Error).message}` }, { status: 500 })
  }
}
