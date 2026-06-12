import { createClient } from '@/lib/supabase/client'

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogContext {
  [key: string]: unknown
}

interface LogPayload {
  level: LogLevel
  message: string
  stack?: string
  url?: string
  user_agent?: string
  context?: LogContext
}

async function persistLog(payload: LogPayload): Promise<void> {
  try {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    let user_id: string | null = null
    if (user) {
      const { data } = await sb.from('tt_users').select('id').eq('auth_id', user.id).maybeSingle()
      user_id = data?.id ?? null
    }
    await sb.from('tt_app_errors').insert({
      level: payload.level,
      message: payload.message,
      stack: payload.stack ?? null,
      url: payload.url ?? (typeof window !== 'undefined' ? window.location.href : null),
      user_agent: payload.user_agent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null),
      user_id,
      context: payload.context ?? null,
    })
  } catch {
    // Logging must never throw — swallow errors and fall back to console.
    if (typeof console !== 'undefined') {
      console.error('[log-error] failed to persist', payload)
    }
  }
}

export function logError(err: unknown, context?: LogContext): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  void persistLog({ level: 'error', message, stack, context })
  if (typeof console !== 'undefined') console.error('[error]', message, context ?? '')
}

export function logWarn(message: string, context?: LogContext): void {
  void persistLog({ level: 'warn', message, context })
  if (typeof console !== 'undefined') console.warn('[warn]', message, context ?? '')
}

export function logInfo(message: string, context?: LogContext): void {
  void persistLog({ level: 'info', message, context })
}
