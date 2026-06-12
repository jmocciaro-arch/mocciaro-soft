import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|forms/|portal/|manifest.json|robots.txt|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml)$).*)',
  ],
}
