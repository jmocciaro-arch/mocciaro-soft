import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // sw.js / offline.html / manifest.json / icons/ deben servirse anónimos:
  // si el middleware los manda a /login, los navegadores deslogueados no pueden
  // actualizar el service worker (el update check recibe HTML) ni precachear la PWA.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|forms/|portal/|sw\\.js|offline\\.html|manifest\\.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
