/**
 * PROCESS ENGINE — Master Spec v3.0
 *
 * Core services for managing process instances, stages, documents,
 * threads, and audit logs. Used by API routes and UI components.
 *
 * All functions create their own Supabase client internally
 * (never passed as parameter, never in dependency arrays).
 */

import { createClient } from '@/lib/supabase/client'
import type {
  ProcessType, ProcessStatus, StageStatus,
  ProcessInstance, ProcessStage, ProcessStageDefinition,
  CreateProcessInput, AdvanceStageInput, LinkDocumentInput,
  AuditLogEntry,
} from '@/types/process'

type Row = Record<string, unknown>

// =====================================================
// COLOR RULES
// =====================================================

function computeColorCode(
  status: ProcessStatus,
  progressPercent: number,
  expectedEnd: string | null,
  stages: Array<{ status: string; due_date: string | null }>
): string {
  if (status === 'completed') return '#3B82F6' // blue
  if (status === 'cancelled') return '#6B7280' // gray
  if (status === 'blocked') return '#EF4444' // red

  // Check if any stage is overdue
  const now = new Date()
  const hasOverdue = stages.some(s => {
    if (s.status === 'completed' || s.status === 'skipped') return false
    if (!s.due_date) return false
    return new Date(s.due_date) < now
  })
  if (hasOverdue) return '#EF4444' // red — overdue

  // Check if process expected_end is past
  if (expectedEnd && new Date(expectedEnd) < now && status === 'active') {
    return '#EF4444' // red — overall overdue
  }

  // Check if any stage is close to due
  const hasCloseDue = stages.some(s => {
    if (s.status === 'completed' || s.status === 'skipped') return false
    if (!s.due_date) return false
    const diff = new Date(s.due_date).getTime() - now.getTime()
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000 // 3 days
  })
  if (hasCloseDue) return '#F59E0B' // yellow — close to due

  if (progressPercent >= 80) return '#10B981' // green — almost done
  if (progressPercent >= 40) return '#F59E0B' // yellow — in progress

  return '#6B7280' // gray — early stages
}

// =====================================================
// CREATE PROCESS INSTANCE
// =====================================================

export async function createProcessInstance(input: CreateProcessInput): Promise<ProcessInstance> {
  const supabase = createClient()

  // 1. Get stage definitions for this process type
  const { data: definitions, error: defError } = await supabase
    .from('tt_process_stage_definitions')
    .select('*')
    .eq('process_type', input.process_type)
    .order('stage_order')

  if (defError || !definitions || definitions.length === 0) {
    throw new Error(`No stage definitions found for process type: ${input.process_type}`)
  }

  const firstStage = definitions[0]

  // 2. Create the process instance
  const { data: process, error: piError } = await supabase
    .from('tt_process_instances')
    .insert({
      process_type: input.process_type,
      name: input.name,
      customer_id: input.customer_id || null,
      supplier_id: input.supplier_id || null,
      company_id: input.company_id || null,
      origin_document_id: input.origin_document_id || null,
      current_stage_code: firstStage.code,
      current_stage_order: 1,
      current_status: 'active',
      progress_percent: 0,
      color_code: '#6B7280',
      assigned_to_user_id: input.assigned_to_user_id || null,
      created_by_user_id: input.created_by_user_id || null,
      expected_end_at: input.expected_end_at || null,
      metadata: input.metadata || {},
    })
    .select()
    .single()

  if (piError || !process) throw piError || new Error('Failed to create process instance')

  // 3. Create all stages (first one in_progress, rest pending)
  const stages = definitions.map((def: Row, idx: number) => ({
    process_instance_id: process.id,
    stage_definition_id: def.id,
    stage_order: def.stage_order as number,
    code: def.code,
    name: def.name,
    status: idx === 0 ? 'in_progress' : 'pending',
    started_at: idx === 0 ? new Date().toISOString() : null,
  }))

  const { error: stagesError } = await supabase
    .from('tt_process_stages')
    .insert(stages)

  if (stagesError) throw stagesError

  // 4. Create thread for internal chat
  await supabase.from('tt_threads').insert({
    entity_type: 'process_instance',
    entity_id: process.id,
    title: input.name,
    created_by_user_id: input.created_by_user_id || null,
  })

  // 5. Post system message to thread
  const { data: thread } = await supabase
    .from('tt_threads')
    .select('id')
    .eq('entity_type', 'process_instance')
    .eq('entity_id', process.id)
    .single()

  if (thread) {
    await supabase.from('tt_messages').insert({
      thread_id: thread.id,
      content: `Proceso "${input.name}" creado. Tipo: ${input.process_type}. Etapa actual: ${firstStage.name}.`,
      is_system: true,
      is_internal: true,
    })
  }

  // 6. Link origin document if provided
  if (input.origin_document_id) {
    await linkDocumentToProcess({
      process_instance_id: process.id as string,
      document_id: input.origin_document_id,
      stage_code: firstStage.code as string,
      role: 'origin',
    })

    // Also set process_instance_id on the document
    await supabase
      .from('tt_documents')
      .update({ process_instance_id: process.id })
      .eq('id', input.origin_document_id)
  }

  // 7. Audit log
  await writeAuditLog({
    entity_type: 'process_instance',
    entity_id: process.id as string,
    action: 'create',
    changed_by_user_id: input.created_by_user_id || null,
    new_values: { process_type: input.process_type, name: input.name, status: 'active' },
    description: `Proceso "${input.name}" creado (${input.process_type})`,
  })

  return process as unknown as ProcessInstance
}

// =====================================================
// ADVANCE STAGE
// =====================================================

export async function advanceStage(input: AdvanceStageInput): Promise<{
  process: ProcessInstance
  completedStage: ProcessStage
  nextStage: ProcessStage | null
}> {
  const supabase = createClient()

  // 1. Get current process with stages
  const { data: process } = await supabase
    .from('tt_process_instances')
    .select('*')
    .eq('id', input.process_instance_id)
    .single()

  if (!process) throw new Error('Process instance not found')

  const { data: stages } = await supabase
    .from('tt_process_stages')
    .select('*')
    .eq('process_instance_id', input.process_instance_id)
    .order('stage_order')

  if (!stages || stages.length === 0) throw new Error('No stages found')

  // 2. Find current in_progress stage
  const currentStage = stages.find((s: Row) => s.status === 'in_progress')
  if (!currentStage) throw new Error('No stage in progress')

  // 3. Complete current stage
  const now = new Date().toISOString()
  await supabase.from('tt_process_stages').update({
    status: 'completed',
    completed_at: now,
    notes: input.notes || null,
    stage_data: input.stage_data || {},
    document_id: input.document_id || null,
  }).eq('id', currentStage.id)

  // 4. Find next pending stage
  const nextStage = stages.find(
    (s: Row) => (s.stage_order as number) > (currentStage.stage_order as number) && s.status === 'pending'
  )

  if (nextStage) {
    // Advance to next stage
    await supabase.from('tt_process_stages').update({
      status: 'in_progress',
      started_at: now,
    }).eq('id', nextStage.id)

    // Update process instance
    const completedCount = stages.filter(
      (s: Row) => s.status === 'completed' || (s.id === currentStage.id)
    ).length
    const progressPercent = Math.round((completedCount / stages.length) * 100)

    const updatedStages = stages.map((s: Row) => ({
      status: s.id === currentStage.id ? 'completed' : s.id === nextStage.id ? 'in_progress' : s.status,
      due_date: s.due_date,
    }))

    const colorCode = computeColorCode(
      'active',
      progressPercent,
      process.expected_end_at as string | null,
      updatedStages as Array<{ status: string; due_date: string | null }>
    )

    await supabase.from('tt_process_instances').update({
      current_stage_code: nextStage.code,
      current_stage_order: nextStage.stage_order,
      progress_percent: progressPercent,
      color_code: colorCode,
    }).eq('id', input.process_instance_id)

    // System message
    await postSystemMessage(
      input.process_instance_id,
      `Etapa "${currentStage.name}" completada. Avanzando a "${nextStage.name}".`
    )
  } else {
    // All stages completed — close process
    await supabase.from('tt_process_instances').update({
      current_status: 'completed',
      progress_percent: 100,
      color_code: '#3B82F6',
      completed_at: now,
    }).eq('id', input.process_instance_id)

    await postSystemMessage(
      input.process_instance_id,
      `Proceso completado. Todas las etapas finalizadas.`
    )
  }

  // 5. Audit log
  await writeAuditLog({
    entity_type: 'process_instance',
    entity_id: input.process_instance_id,
    action: 'stage_advance',
    changed_by_user_id: input.completed_by_user_id || null,
    old_values: { stage: currentStage.code, stage_order: currentStage.stage_order },
    new_values: { stage: nextStage?.code || 'COMPLETED', stage_order: nextStage?.stage_order || null },
    description: `Etapa "${currentStage.name}" completada${nextStage ? `. Siguiente: "${nextStage.name}"` : '. Proceso cerrado.'}`,
  })

  // Reload
  const { data: updatedProcess } = await supabase
    .from('tt_process_instances')
    .select('*')
    .eq('id', input.process_instance_id)
    .single()

  return {
    process: updatedProcess as unknown as ProcessInstance,
    completedStage: { ...currentStage, status: 'completed', completed_at: now } as unknown as ProcessStage,
    nextStage: nextStage as unknown as ProcessStage | null,
  }
}

// =====================================================
// RECALCULATE PROGRESS & COLOR
// =====================================================

export async function recalculateProcess(processInstanceId: string): Promise<ProcessInstance> {
  const supabase = createClient()

  const { data: process } = await supabase
    .from('tt_process_instances')
    .select('*')
    .eq('id', processInstanceId)
    .single()

  if (!process) throw new Error('Process not found')

  const { data: stages } = await supabase
    .from('tt_process_stages')
    .select('*')
    .eq('process_instance_id', processInstanceId)
    .order('stage_order')

  if (!stages) throw new Error('No stages found')

  const completed = stages.filter((s: Row) => s.status === 'completed' || s.status === 'skipped').length
  const total = stages.length
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0

  const colorCode = computeColorCode(
    process.current_status as ProcessStatus,
    progressPercent,
    process.expected_end_at as string | null,
    stages.map((s: Row) => ({ status: s.status as string, due_date: s.due_date as string | null }))
  )

  const { data: updated } = await supabase
    .from('tt_process_instances')
    .update({ progress_percent: progressPercent, color_code: colorCode })
    .eq('id', processInstanceId)
    .select()
    .single()

  return updated as unknown as ProcessInstance
}

// =====================================================
// LINK DOCUMENT TO PROCESS
// =====================================================

export async function linkDocumentToProcess(input: LinkDocumentInput): Promise<void> {
  const supabase = createClient()

  await supabase.from('tt_process_documents').upsert({
    process_instance_id: input.process_instance_id,
    document_id: input.document_id,
    stage_code: input.stage_code || null,
    role: input.role || 'related',
  }, { onConflict: 'process_instance_id,document_id' })

  // Also set FK on document
  await supabase
    .from('tt_documents')
    .update({ process_instance_id: input.process_instance_id })
    .eq('id', input.document_id)
}

// =====================================================
// GET PROCESS WITH FULL DATA
// =====================================================

export async function getProcessFull(processInstanceId: string): Promise<{
  process: ProcessInstance
  stages: ProcessStage[]
  documents: Array<{ document_id: string; stage_code: string | null; role: string }>
  thread: { id: string; messages: Array<{ content: string; author_user_id: string | null; is_system: boolean; created_at: string }> } | null
}> {
  const supabase = createClient()

  const [processRes, stagesRes, docsRes, threadRes] = await Promise.all([
    supabase.from('tt_process_instances').select('*').eq('id', processInstanceId).single(),
    supabase.from('tt_process_stages').select('*').eq('process_instance_id', processInstanceId).order('stage_order'),
    supabase.from('tt_process_documents').select('document_id, stage_code, role').eq('process_instance_id', processInstanceId),
    supabase.from('tt_threads').select('id').eq('entity_type', 'process_instance').eq('entity_id', processInstanceId).single(),
  ])

  let threadData = null
  if (threadRes.data) {
    const { data: messages } = await supabase
      .from('tt_messages')
      .select('content, author_user_id, is_system, created_at')
      .eq('thread_id', threadRes.data.id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: true })

    threadData = {
      id: threadRes.data.id as string,
      messages: (messages || []) as Array<{ content: string; author_user_id: string | null; is_system: boolean; created_at: string }>,
    }
  }

  return {
    process: processRes.data as unknown as ProcessInstance,
    stages: (stagesRes.data || []) as unknown as ProcessStage[],
    documents: (docsRes.data || []) as Array<{ document_id: string; stage_code: string | null; role: string }>,
    thread: threadData,
  }
}

// =====================================================
// LIST PROCESSES
// =====================================================

export async function listProcesses(filters?: {
  process_type?: ProcessType
  customer_id?: string
  company_id?: string
  current_status?: ProcessStatus
  limit?: number
}): Promise<ProcessInstance[]> {
  const supabase = createClient()

  let query = supabase
    .from('tt_process_instances')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.process_type) query = query.eq('process_type', filters.process_type)
  if (filters?.customer_id) query = query.eq('customer_id', filters.customer_id)
  if (filters?.company_id) query = query.eq('company_id', filters.company_id)
  if (filters?.current_status) query = query.eq('current_status', filters.current_status)

  query = query.limit(filters?.limit || 100)

  const { data } = await query
  return (data || []) as unknown as ProcessInstance[]
}

// =====================================================
// UPDATE PROCESS STATUS
// =====================================================

export async function updateProcessStatus(
  processInstanceId: string,
  newStatus: ProcessStatus,
  userId?: string
): Promise<ProcessInstance> {
  const supabase = createClient()

  const { data: old } = await supabase
    .from('tt_process_instances')
    .select('current_status')
    .eq('id', processInstanceId)
    .single()

  const updates: Record<string, unknown> = { current_status: newStatus }
  if (newStatus === 'completed') {
    updates.completed_at = new Date().toISOString()
    updates.progress_percent = 100
    updates.color_code = '#3B82F6'
  }
  if (newStatus === 'cancelled') {
    updates.color_code = '#6B7280'
  }
  if (newStatus === 'blocked') {
    updates.color_code = '#EF4444'
  }

  const { data: updated } = await supabase
    .from('tt_process_instances')
    .update(updates)
    .eq('id', processInstanceId)
    .select()
    .single()

  await writeAuditLog({
    entity_type: 'process_instance',
    entity_id: processInstanceId,
    action: 'status_change',
    changed_by_user_id: userId || null,
    old_values: { status: old?.current_status },
    new_values: { status: newStatus },
    description: `Estado cambiado: ${old?.current_status} → ${newStatus}`,
  })

  await postSystemMessage(processInstanceId, `Estado cambiado a "${newStatus}".`)

  return updated as unknown as ProcessInstance
}

// =====================================================
// HELPERS: AUDIT LOG
// =====================================================

export async function writeAuditLog(entry: Partial<AuditLogEntry> & { entity_type: string; entity_id: string; action: string }): Promise<void> {
  const supabase = createClient()
  await supabase.from('tt_audit_log').insert({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    changed_by_user_id: entry.changed_by_user_id || null,
    old_values: entry.old_values || null,
    new_values: entry.new_values || null,
    description: entry.description || null,
  })
}

// =====================================================
// HELPERS: SYSTEM MESSAGES
// =====================================================

async function postSystemMessage(processInstanceId: string, content: string): Promise<void> {
  const supabase = createClient()

  const { data: thread } = await supabase
    .from('tt_threads')
    .select('id')
    .eq('entity_type', 'process_instance')
    .eq('entity_id', processInstanceId)
    .single()

  if (thread) {
    await supabase.from('tt_messages').insert({
      thread_id: thread.id,
      content,
      is_system: true,
      is_internal: true,
    })
  }
}

// =====================================================
// HELPERS: THREAD/MESSAGES (for any entity)
// =====================================================

export async function getOrCreateThread(entityType: string, entityId: string, userId?: string): Promise<string> {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('tt_threads')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (existing) return existing.id as string

  const { data: created } = await supabase
    .from('tt_threads')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      created_by_user_id: userId || null,
    })
    .select('id')
    .single()

  return created?.id as string
}

export async function postMessage(
  threadId: string,
  authorUserId: string,
  content: string,
  options?: { is_internal?: boolean; attachments?: Array<{ name: string; url: string; size: number; type: string }>; mentions?: string[] }
): Promise<void> {
  const supabase = createClient()
  await supabase.from('tt_messages').insert({
    thread_id: threadId,
    author_user_id: authorUserId,
    content,
    is_internal: options?.is_internal ?? true,
    attachments: options?.attachments || [],
    mentions: options?.mentions || [],
  })
}

export async function getMessages(threadId: string, limit = 50): Promise<Array<{
  id: string; content: string; author_user_id: string | null; is_system: boolean; created_at: string; attachments: unknown[]
}>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('tt_messages')
    .select('id, content, author_user_id, is_system, created_at, attachments')
    .eq('thread_id', threadId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data || []) as Array<{
    id: string; content: string; author_user_id: string | null; is_system: boolean; created_at: string; attachments: unknown[]
  }>
}
