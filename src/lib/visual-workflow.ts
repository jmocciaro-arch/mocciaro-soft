/**
 * VISUAL WORKFLOW BUILDER
 *
 * Capa de datos para los diagramas visuales tipo Make/n8n.
 *
 * Tabla principales:
 *   - tt_visual_workflows  — la "tela" (canvas)
 *   - tt_workflow_nodes    — los bloques
 *   - tt_workflow_edges    — las flechas que los conectan
 *
 * Convención: cuando un workflow tiene `entity_type` y `entity_id`, es una
 * **instancia** vinculada a un cliente / OC / oportunidad real. Cuando
 * `is_template = true`, es una plantilla reutilizable.
 */

import { createClient } from '@/lib/supabase/client'

export type WorkflowScope = 'client' | 'opportunity' | 'order' | 'sat' | 'custom'

export type NodeType =
  | 'trigger'
  | 'stage'
  | 'action'
  | 'condition'
  | 'document'
  | 'approval'
  | 'note'
  | 'integration'

export type NodeStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked'
  | 'failed'

export interface VisualWorkflow {
  id: string
  name: string
  description: string | null
  scope: WorkflowScope
  entity_type: string | null
  entity_id: string | null
  company_id: string | null
  is_template: boolean
  parent_template_id: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowAttachment {
  id: string
  name: string
  url: string
  size: number
  type: string
  uploaded_at: string
}

export interface WorkflowNode {
  id: string
  workflow_id: string
  node_type: NodeType
  node_subtype: string | null
  label: string
  description: string | null
  icon: string | null
  color: string
  status: NodeStatus
  position_x: number
  position_y: number
  config: Record<string, unknown>
  notes: string | null
  attachments: WorkflowAttachment[]
  document_id: string | null
  process_stage_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowEdge {
  id: string
  workflow_id: string
  source_node_id: string
  target_node_id: string
  source_handle: string | null
  target_handle: string | null
  label: string | null
  edge_type: string
  animated: boolean
  created_at: string
}

// =====================================================
// QUERIES
// =====================================================

export async function listWorkflows(filters?: {
  scope?: WorkflowScope
  entity_type?: string
  entity_id?: string
  is_template?: boolean
  company_id?: string
}): Promise<VisualWorkflow[]> {
  const sb = createClient()
  let q = sb.from('tt_visual_workflows').select('*').order('updated_at', { ascending: false })
  if (filters?.scope) q = q.eq('scope', filters.scope)
  if (filters?.entity_type) q = q.eq('entity_type', filters.entity_type)
  if (filters?.entity_id) q = q.eq('entity_id', filters.entity_id)
  if (filters?.is_template !== undefined) q = q.eq('is_template', filters.is_template)
  if (filters?.company_id) q = q.eq('company_id', filters.company_id)
  const { data } = await q
  return (data as VisualWorkflow[] | null) ?? []
}

export async function getWorkflow(id: string): Promise<{
  workflow: VisualWorkflow | null
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}> {
  const sb = createClient()
  const [wfRes, nodesRes, edgesRes] = await Promise.all([
    sb.from('tt_visual_workflows').select('*').eq('id', id).single(),
    sb.from('tt_workflow_nodes').select('*').eq('workflow_id', id).order('created_at'),
    sb.from('tt_workflow_edges').select('*').eq('workflow_id', id),
  ])
  return {
    workflow: (wfRes.data as VisualWorkflow | null) ?? null,
    nodes: (nodesRes.data as WorkflowNode[] | null) ?? [],
    edges: (edgesRes.data as WorkflowEdge[] | null) ?? [],
  }
}

// =====================================================
// MUTATIONS
// =====================================================

export async function createWorkflow(input: {
  name: string
  description?: string
  scope?: WorkflowScope
  entity_type?: string
  entity_id?: string
  company_id?: string
  is_template?: boolean
  parent_template_id?: string
  created_by_user_id?: string
}): Promise<VisualWorkflow> {
  const sb = createClient()
  const { data, error } = await sb
    .from('tt_visual_workflows')
    .insert({
      name: input.name,
      description: input.description ?? null,
      scope: input.scope ?? 'custom',
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      company_id: input.company_id ?? null,
      is_template: input.is_template ?? false,
      parent_template_id: input.parent_template_id ?? null,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as VisualWorkflow
}

export async function updateWorkflow(id: string, patch: Partial<{
  name: string; description: string; scope: WorkflowScope
}>): Promise<void> {
  const sb = createClient()
  const { error } = await sb.from('tt_visual_workflows').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteWorkflow(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb.from('tt_visual_workflows').delete().eq('id', id)
  if (error) throw error
}

export async function upsertNode(node: Partial<WorkflowNode> & {
  workflow_id: string
  label: string
  position_x: number
  position_y: number
}): Promise<WorkflowNode> {
  const sb = createClient()
  const payload = {
    workflow_id: node.workflow_id,
    node_type: node.node_type ?? 'stage',
    node_subtype: node.node_subtype ?? null,
    label: node.label,
    description: node.description ?? null,
    icon: node.icon ?? null,
    color: node.color ?? '#FF6600',
    status: node.status ?? 'pending',
    position_x: node.position_x,
    position_y: node.position_y,
    config: node.config ?? {},
    notes: node.notes ?? null,
    attachments: node.attachments ?? [],
    document_id: node.document_id ?? null,
    process_stage_id: node.process_stage_id ?? null,
  }

  if (node.id) {
    const { data, error } = await sb
      .from('tt_workflow_nodes')
      .update(payload)
      .eq('id', node.id)
      .select('*')
      .single()
    if (error) throw error
    return data as WorkflowNode
  }
  const { data, error } = await sb
    .from('tt_workflow_nodes')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data as WorkflowNode
}

export async function deleteNode(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb.from('tt_workflow_nodes').delete().eq('id', id)
  if (error) throw error
}

export async function upsertEdge(edge: Partial<WorkflowEdge> & {
  workflow_id: string
  source_node_id: string
  target_node_id: string
}): Promise<WorkflowEdge> {
  const sb = createClient()
  const payload = {
    workflow_id: edge.workflow_id,
    source_node_id: edge.source_node_id,
    target_node_id: edge.target_node_id,
    source_handle: edge.source_handle ?? null,
    target_handle: edge.target_handle ?? null,
    label: edge.label ?? null,
    edge_type: edge.edge_type ?? 'smoothstep',
    animated: edge.animated ?? false,
  }

  if (edge.id) {
    const { data, error } = await sb
      .from('tt_workflow_edges').update(payload).eq('id', edge.id).select('*').single()
    if (error) throw error
    return data as WorkflowEdge
  }
  const { data, error } = await sb
    .from('tt_workflow_edges').insert(payload).select('*').single()
  if (error) throw error
  return data as WorkflowEdge
}

export async function deleteEdge(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb.from('tt_workflow_edges').delete().eq('id', id)
  if (error) throw error
}

// =====================================================
// HELPERS
// =====================================================

/** Posiciones por defecto cuando se crea un workflow vacío con la plantilla
 * "Lead-to-Cash" — quedan alineados horizontalmente. */
export const DEFAULT_LEAD_TO_CASH_NODES: Array<Partial<WorkflowNode> & { label: string }> = [
  { label: 'Lead',         node_type: 'trigger',  icon: 'sparkles',     color: '#8B5CF6', position_x: 50,   position_y: 200 },
  { label: 'Oportunidad',  node_type: 'stage',    icon: 'target',       color: '#3B82F6', position_x: 250,  position_y: 200 },
  { label: 'Cotización',   node_type: 'document', icon: 'file-text',    color: '#FF6600', position_x: 450,  position_y: 200 },
  { label: 'OC Cliente',   node_type: 'document', icon: 'upload',       color: '#F59E0B', position_x: 650,  position_y: 200 },
  { label: 'Pedido',       node_type: 'document', icon: 'package',      color: '#10B981', position_x: 850,  position_y: 200 },
  { label: 'Albarán',      node_type: 'document', icon: 'truck',        color: '#06B6D4', position_x: 1050, position_y: 200 },
  { label: 'Factura',      node_type: 'document', icon: 'credit-card',  color: '#EC4899', position_x: 1250, position_y: 200 },
  { label: 'Cobro',        node_type: 'action',   icon: 'dollar-sign',  color: '#10B981', position_x: 1450, position_y: 200 },
]

export async function seedTemplateNodes(workflowId: string): Promise<void> {
  const sb = createClient()

  // Crear nodos
  const nodesPayload = DEFAULT_LEAD_TO_CASH_NODES.map(n => ({
    workflow_id: workflowId,
    node_type: n.node_type ?? 'stage',
    label: n.label,
    icon: n.icon ?? null,
    color: n.color ?? '#FF6600',
    status: 'pending',
    position_x: n.position_x ?? 0,
    position_y: n.position_y ?? 0,
    config: {},
    attachments: [],
  }))

  const { data: nodes, error: nodesError } = await sb
    .from('tt_workflow_nodes')
    .insert(nodesPayload)
    .select('*')

  if (nodesError) throw nodesError

  // Crear edges secuenciales
  if (nodes && nodes.length > 1) {
    const edges = []
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        workflow_id: workflowId,
        source_node_id: (nodes[i] as { id: string }).id,
        target_node_id: (nodes[i + 1] as { id: string }).id,
        edge_type: 'smoothstep',
        animated: false,
      })
    }
    await sb.from('tt_workflow_edges').insert(edges)
  }
}

/**
 * Crea un workflow para una entidad (cliente, OC, etc.) clonando una plantilla.
 * Devuelve el ID del nuevo workflow.
 */
export async function createWorkflowFromTemplate(input: {
  templateId?: string
  name: string
  scope: WorkflowScope
  entity_type: string
  entity_id: string
  company_id?: string
  created_by_user_id?: string
}): Promise<string> {
  // Crear el workflow vacío
  const wf = await createWorkflow({
    name: input.name,
    scope: input.scope,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    company_id: input.company_id,
    parent_template_id: input.templateId,
    is_template: false,
    created_by_user_id: input.created_by_user_id,
  })

  // Si hay template, clonar sus nodos y edges
  if (input.templateId) {
    const sb = createClient()
    const [nodesRes, edgesRes] = await Promise.all([
      sb.from('tt_workflow_nodes').select('*').eq('workflow_id', input.templateId),
      sb.from('tt_workflow_edges').select('*').eq('workflow_id', input.templateId),
    ])

    const oldToNew = new Map<string, string>()

    if (nodesRes.data && nodesRes.data.length > 0) {
      const newNodes = nodesRes.data.map((n: WorkflowNode) => ({
        workflow_id: wf.id,
        node_type: n.node_type,
        node_subtype: n.node_subtype,
        label: n.label,
        description: n.description,
        icon: n.icon,
        color: n.color,
        status: 'pending' as const,
        position_x: n.position_x,
        position_y: n.position_y,
        config: n.config,
        notes: null,
        attachments: [],
      }))
      const inserted = await sb.from('tt_workflow_nodes').insert(newNodes).select('id')
      ;(nodesRes.data as WorkflowNode[]).forEach((n, i) => {
        oldToNew.set(n.id, (inserted.data as Array<{ id: string }> | null)?.[i]?.id ?? '')
      })
    }

    if (edgesRes.data && edgesRes.data.length > 0) {
      const newEdges = (edgesRes.data as WorkflowEdge[])
        .map(e => ({
          workflow_id: wf.id,
          source_node_id: oldToNew.get(e.source_node_id) ?? '',
          target_node_id: oldToNew.get(e.target_node_id) ?? '',
          source_handle: e.source_handle,
          target_handle: e.target_handle,
          label: e.label,
          edge_type: e.edge_type,
          animated: e.animated,
        }))
        .filter(e => e.source_node_id && e.target_node_id)

      if (newEdges.length > 0) {
        await sb.from('tt_workflow_edges').insert(newEdges)
      }
    }
  } else {
    // Sin template — sembrar el flow estándar Lead-to-Cash
    await seedTemplateNodes(wf.id)
  }

  return wf.id
}
