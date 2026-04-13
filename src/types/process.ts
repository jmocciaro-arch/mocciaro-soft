// =====================================================
// PROCESS ENGINE TYPES — Master Spec v3.0
// =====================================================

export type ProcessType =
  | 'LEAD_TO_CASH'
  | 'PURCHASE_TO_PAY'
  | 'IMPORT_OPERATION'
  | 'PRODUCTION_FLOW'
  | 'COLLECTION_FLOW'
  | 'MAINTENANCE_FLOW'
  | 'INTERNAL_REQUEST_FLOW'

export type ProcessStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'blocked'
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked'
export type ColorCode = '#10B981' | '#F59E0B' | '#EF4444' | '#3B82F6' | '#6B7280'

export interface ProcessStageDefinition {
  id: string
  process_type: ProcessType
  stage_order: number
  code: string
  name: string
  description: string | null
  color: string
  icon: string | null
  is_mandatory: boolean
}

export interface ProcessInstance {
  id: string
  process_type: ProcessType
  name: string
  customer_id: string | null
  supplier_id: string | null
  company_id: string | null
  origin_document_id: string | null
  current_stage_code: string | null
  current_stage_order: number
  current_status: ProcessStatus
  progress_percent: number
  color_code: string
  assigned_to_user_id: string | null
  created_by_user_id: string | null
  started_at: string
  expected_end_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProcessStage {
  id: string
  process_instance_id: string
  stage_definition_id: string
  stage_order: number
  code: string
  name: string
  status: StageStatus
  started_at: string | null
  completed_at: string | null
  due_date: string | null
  assigned_to_user_id: string | null
  document_id: string | null
  notes: string | null
  stage_data: Record<string, unknown>
  created_at: string
}

export interface ProcessDocument {
  id: string
  process_instance_id: string
  document_id: string
  stage_code: string | null
  role: string
  created_at: string
}

export interface Thread {
  id: string
  entity_type: string
  entity_id: string
  title: string | null
  is_resolved: boolean
  created_by_user_id: string | null
  created_at: string
}

export interface Message {
  id: string
  thread_id: string
  author_user_id: string | null
  content: string
  is_internal: boolean
  is_system: boolean
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  mentions: string[]
  is_hidden: boolean
  created_at: string
}

export interface AuditLogEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  changed_by_user_id: string | null
  changed_at: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  description: string | null
}

// =====================================================
// Create/Update DTOs
// =====================================================

export interface CreateProcessInput {
  process_type: ProcessType
  name: string
  customer_id?: string
  supplier_id?: string
  company_id?: string
  origin_document_id?: string
  assigned_to_user_id?: string
  created_by_user_id?: string
  expected_end_at?: string
  metadata?: Record<string, unknown>
}

export interface AdvanceStageInput {
  process_instance_id: string
  notes?: string
  stage_data?: Record<string, unknown>
  document_id?: string
  completed_by_user_id?: string
}

export interface LinkDocumentInput {
  process_instance_id: string
  document_id: string
  stage_code?: string
  role?: string
}

export interface CreateMessageInput {
  thread_id: string
  author_user_id: string
  content: string
  is_internal?: boolean
  attachments?: Array<{ name: string; url: string; size: number; type: string }>
  mentions?: string[]
}
