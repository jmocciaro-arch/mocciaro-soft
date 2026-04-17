'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface PausedWorkflow {
  ticket_id: string
  reason: string
  detail: string | null
  current_step: number
  snapshot: Record<string, unknown>
  paused_by: string | null
  paused_at: string
  // Joined
  tt_sat_tickets?: {
    number: string | null
    description: string | null
    client_id: string | null
    tt_clients?: { name: string } | null
  }
}

export function usePausedWorkflows() {
  const [paused, setPaused] = useState<PausedWorkflow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_sat_paused_workflows')
      .select('*, tt_sat_tickets(number, description, client_id, tt_clients(name))')
      .order('paused_at', { ascending: false })
    setPaused((data || []) as PausedWorkflow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const pause = useCallback(async (
    ticketId: string,
    reason: string,
    detail: string,
    currentStep: number,
    snapshot: Record<string, unknown>,
    pausedBy: string | null
  ) => {
    const sb = createClient()
    const { error } = await sb.from('tt_sat_paused_workflows').upsert({
      ticket_id: ticketId,
      reason,
      detail: detail || null,
      current_step: currentStep,
      snapshot,
      paused_by: pausedBy,
      paused_at: new Date().toISOString(),
    })
    if (error) throw error
    // Tambien actualizar ticket status
    await sb.from('tt_sat_tickets').update({ status: 'waiting_parts' }).eq('id', ticketId)
    await load()
  }, [load])

  const resume = useCallback(async (ticketId: string) => {
    const sb = createClient()
    const { data: pausedRow } = await sb
      .from('tt_sat_paused_workflows')
      .select('snapshot, current_step')
      .eq('ticket_id', ticketId)
      .maybeSingle()
    const snapshot = pausedRow?.snapshot || null
    // Remover el registro de pausa
    const { error } = await sb.from('tt_sat_paused_workflows').delete().eq('ticket_id', ticketId)
    if (error) throw error
    // Volver status a in_progress
    await sb.from('tt_sat_tickets').update({ status: 'in_progress' }).eq('id', ticketId)
    await load()
    return { snapshot, current_step: pausedRow?.current_step ?? 0 }
  }, [load])

  const discard = useCallback(async (ticketId: string) => {
    const sb = createClient()
    const { error } = await sb.from('tt_sat_paused_workflows').delete().eq('ticket_id', ticketId)
    if (error) throw error
    await load()
  }, [load])

  return { paused, loading, reload: load, pause, resume, discard }
}
