import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Errores que indican "no hay sesión válida" — distinto de "no pude verificar".
// Lista basada en @supabase/auth-js: cuando el token está vencido o falta, devuelve
// AuthSessionMissingError o AuthApiError con name conocido. Cualquier otra cosa
// (fetch failed, ENOTFOUND, ETIMEDOUT, AbortError) la tratamos como red caída.
const AUTH_ERROR_NAMES = new Set([
  'AuthSessionMissingError',
  'AuthApiError',
  'AuthInvalidJwtError',
])

function hasSupabaseSessionCookie(request: NextRequest): boolean {
  // @supabase/ssr guarda el token en cookies tipo `sb-<project-ref>-auth-token`
  // (o `sb-<project-ref>-auth-token.0`, `.1` para chunks grandes).
  // No conocemos el project-ref acá: matchemos el patrón.
  return request.cookies
    .getAll()
    .some((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name) && c.value.length > 0)
}

function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (AUTH_ERROR_NAMES.has(err.name)) return false
  // fetch nativo de Node 20+ tira TypeError("fetch failed") con cause: DOMException.
  // El cliente de Supabase puede envolverlo en su propio error pero name suele quedar.
  const msg = err.message.toLowerCase()
  return (
    err.name === 'TypeError' ||
    err.name === 'AbortError' ||
    err.name === 'FetchError' ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up')
  )
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user: { id: string } | null = null
  let networkDown = false

  // Timeout duro de 1500ms: si Supabase no contesta a tiempo, asumimos red
  // caída/degradada y caemos al fallback offline. Esto evita que la app se
  // cuelgue 30s+ esperando un timeout HTTP cuando la red existe pero no llega.
  const AUTH_TIMEOUT_MS = 1500
  const timeout = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), AUTH_TIMEOUT_MS)
  )

  try {
    const raced = await Promise.race([
      supabase.auth.getUser().then((r) => ({ result: r, timedOut: false as const })),
      timeout,
    ])
    if ('result' in raced) {
      user = raced.result.data.user
    } else {
      networkDown = true
      console.warn(`[middleware] Supabase auth timeout (${AUTH_TIMEOUT_MS}ms). Modo offline si hay cookie.`)
    }
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      networkDown = true
      console.warn('[middleware] Supabase auth no disponible (probable offline). Cayendo a modo offline si hay cookie de sesión.')
    } else {
      // Errores no-red: dejamos que el flujo normal de "user null" decida.
      console.error('[middleware] Error inesperado en auth.getUser():', err)
    }
  }

  const pathname = request.nextUrl.pathname
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/reset-password')

  // Caso 1: Supabase respondió y NO hay user → flujo normal, redirect a login.
  // Caso 2: red caída pero hay cookie de sesión → permitimos entrar en modo offline.
  //         La UI muestra el banner de OfflineIndicator y bloquea escrituras.
  // Caso 3: red caída y NO hay cookie → redirect a login con bandera para que la
  //         pantalla muestre "necesitás internet para iniciar sesión por primera vez".
  if (!user && !isAuthRoute) {
    const hasCookie = hasSupabaseSessionCookie(request)

    if (networkDown && hasCookie) {
      // Modo offline tolerado. Inyectamos un header para que las server actions
      // sepan que están en modo degradado y eviten queries que requieran red.
      supabaseResponse.headers.set('x-mocciaro-offline-mode', '1')
      return supabaseResponse
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (networkDown) url.searchParams.set('reason', 'offline')
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
