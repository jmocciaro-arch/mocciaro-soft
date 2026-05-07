import { getAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

/**
 * Wrapper de cron jobs que loguea start/success/fail a tt_cron_runs.
 *
 * Fase 0.6 del PLAN-REFACTOR. Hoy los crons en /api/cron/* corren
 * sin observabilidad — si fallan 3 días seguidos, no nos enteramos.
 * Este helper inserta una fila en tt_cron_runs por cada corrida.
 *
 * USO en un cron handler:
 *
 *   export const GET = withCronLogging('alerts', async (req) => {
 *     // ...lógica del cron...
 *     return { success: true, processed: 42 }  // result se guarda en tt_cron_runs.result
 *   })
 *
 * Si el cron tira excepción, queda como `failed` con mensaje + stack.
 * Si la tabla tt_cron_runs no existe (migración v59 no aplicada),
 * el wrapper sigue funcionando en degraded mode (loguea por console).
 *
 * Verifica CRON_SECRET automáticamente (header `Authorization: Bearer ...`).
 */

import { NextResponse } from 'next/server'

type CronHandler<T = unknown> = (req: NextRequest) => Promise<T>

interface CronOptions {
  /** Si true (default), valida header `Authorization: Bearer ${CRON_SECRET}` antes de correr. */
  requireSecret?: boolean
  /** Endpoint path (auto-detectado del request si no se pasa). */
  endpoint?: string
}

export function withCronLogging<T>(
  cronName: string,
  handler: CronHandler<T>,
  opts: CronOptions = {}
): (req: NextRequest) => Promise<NextResponse> {
  const requireSecret = opts.requireSecret ?? true

  return async (req: NextRequest): Promise<NextResponse> => {
    // 1. Verificar CRON_SECRET (defensa contra triggers no autorizados)
    if (requireSecret) {
      const authHeader = req.headers.get('authorization') ?? ''
      const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
      if (!process.env.CRON_SECRET || authHeader !== expected) {
        return NextResponse.json({ error: 'cron secret inválido' }, { status: 401 })
      }
    }

    const endpoint = opts.endpoint ?? new URL(req.url).pathname
    const triggeredBy = req.headers.get('x-vercel-cron') ? 'vercel-cron' : 'manual'

    // 2. Crear fila "started" (degraded si tabla no existe)
    let runId: string | null = null
    try {
      const sb = getAdminClient()
      const { data, error } = await sb.rpc('fn_log_cron_start', {
        p_cron_name: cronName,
        p_endpoint: endpoint,
        p_triggered_by: triggeredBy,
        p_app_version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      })
      if (!error && data) {
        runId = data as unknown as string
      } else if (error) {
        console.warn(`[cron:${cronName}] no pude loguear start:`, error.message)
      }
    } catch (e) {
      console.warn(`[cron:${cronName}] no pude loguear start (tabla puede no existir):`, e)
    }

    // 3. Correr el handler
    const startedAt = Date.now()
    try {
      const result = await handler(req)
      const duration = Date.now() - startedAt
      console.log(`[cron:${cronName}] success in ${duration}ms`)

      // 4. Marcar como success
      if (runId) {
        try {
          const sb = getAdminClient()
          await sb.rpc('fn_log_cron_finish', {
            p_run_id: runId,
            p_status: 'success',
            p_result: result == null ? null : (result as unknown as object),
          })
        } catch (e) {
          console.warn(`[cron:${cronName}] no pude loguear finish:`, e)
        }
      }

      return NextResponse.json({
        success: true,
        cron: cronName,
        duration_ms: duration,
        result,
      })
    } catch (err) {
      const duration = Date.now() - startedAt
      const error = err as Error
      console.error(`[cron:${cronName}] failed after ${duration}ms:`, error.message)

      // 5. Marcar como failed
      if (runId) {
        try {
          const sb = getAdminClient()
          await sb.rpc('fn_log_cron_finish', {
            p_run_id: runId,
            p_status: 'failed',
            p_error_message: error.message,
            p_error_stack: error.stack ?? null,
          })
        } catch (e) {
          console.warn(`[cron:${cronName}] no pude loguear failure:`, e)
        }
      }

      return NextResponse.json(
        {
          success: false,
          cron: cronName,
          duration_ms: duration,
          error: error.message,
        },
        { status: 500 }
      )
    }
  }
}
