'use client'

import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useState } from 'react'
import { CustomNode } from './custom-node'
import { NodeInspector } from './node-inspector'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Sparkles, FileText, Zap, GitBranch, MessageSquare,
  CheckCircle2, Loader2,
} from 'lucide-react'
import {
  getWorkflow, upsertNode, deleteNode, upsertEdge, deleteEdge,
  type WorkflowNode, type WorkflowEdge, type VisualWorkflow, type NodeType,
} from '@/lib/visual-workflow'

const nodeTypes = { custom: CustomNode }

interface Props {
  workflowId: string
  /** Si es true, el canvas es solo lectura (modo viewer) */
  readOnly?: boolean
}

export function WorkflowCanvas({ workflowId, readOnly = false }: Props) {
  const { addToast } = useToast()
  const [workflow, setWorkflow] = useState<VisualWorkflow | null>(null)
  const [rfNodes, setRfNodes] = useState<Node[]>([])
  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [allNodes, setAllNodes] = useState<WorkflowNode[]>([])
  const [, setAllEdges] = useState<WorkflowEdge[]>([])
  const [loading, setLoading] = useState(true)

  // ---------------------------------------------------------------
  // LOAD
  // ---------------------------------------------------------------
  const reload = useCallback(async () => {
    setLoading(true)
    const { workflow, nodes, edges } = await getWorkflow(workflowId)
    setWorkflow(workflow)
    setAllNodes(nodes)
    setAllEdges(edges)
    setRfNodes(nodes.map(nodeToRf))
    setRfEdges(edges.map(edgeToRf))
    setLoading(false)
  }, [workflowId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await reload()
    })()
    return () => { cancelled = true }
  }, [reload])

  // ---------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target) return
    setRfEdges((eds) => addEdge({ ...conn, type: 'smoothstep', animated: false }, eds))
    try {
      const newEdge = await upsertEdge({
        workflow_id: workflowId,
        source_node_id: conn.source,
        target_node_id: conn.target,
        edge_type: 'smoothstep',
      })
      setAllEdges(es => [...es, newEdge])
    } catch (err) {
      addToast({ type: 'error', title: 'Error guardando conexión', message: (err as Error).message })
    }
  }, [workflowId, addToast])

  const onNodeClick = useCallback((_e: unknown, node: Node) => {
    const real = allNodes.find(n => n.id === node.id)
    if (real) setSelectedNode(real)
  }, [allNodes])

  const onNodeDragStop = useCallback(async (_e: unknown, node: Node) => {
    const real = allNodes.find(n => n.id === node.id)
    if (!real) return
    try {
      await upsertNode({
        ...real,
        position_x: node.position.x,
        position_y: node.position.y,
      })
    } catch {
      // no toast — drags son frecuentes
    }
  }, [allNodes])

  // ---------------------------------------------------------------
  // ADD NEW NODE
  // ---------------------------------------------------------------
  const addNode = async (type: NodeType, label: string, icon: string, color: string) => {
    try {
      const x = 200 + Math.random() * 400
      const y = 100 + Math.random() * 300
      const newNode = await upsertNode({
        workflow_id: workflowId,
        node_type: type,
        label,
        icon,
        color,
        status: 'pending',
        position_x: x,
        position_y: y,
      })
      setAllNodes(ns => [...ns, newNode])
      setRfNodes(rns => [...rns, nodeToRf(newNode)])
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  // ---------------------------------------------------------------
  // SAVE NODE FROM INSPECTOR
  // ---------------------------------------------------------------
  const handleSaveSelectedNode = async (patch: Partial<WorkflowNode>) => {
    if (!selectedNode) return
    try {
      const updated = await upsertNode({ ...selectedNode, ...patch })
      setAllNodes(ns => ns.map(n => n.id === updated.id ? updated : n))
      setRfNodes(rns => rns.map(rn => rn.id === updated.id ? nodeToRf(updated) : rn))
      addToast({ type: 'success', title: 'Nodo actualizado' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  const handleDeleteSelectedNode = async () => {
    if (!selectedNode) return
    if (!confirm(`¿Eliminar el nodo "${selectedNode.label}"?`)) return
    try {
      await deleteNode(selectedNode.id)
      setAllNodes(ns => ns.filter(n => n.id !== selectedNode.id))
      setRfNodes(rns => rns.filter(rn => rn.id !== selectedNode.id))
      setRfEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
      setSelectedNode(null)
      addToast({ type: 'success', title: 'Nodo eliminado' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      try { await deleteEdge(e.id) } catch { /* ignore */ }
    }
    setAllEdges(eds => eds.filter(e => !deleted.find(d => d.id === e.id)))
  }, [])

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-[#6B7280]">
        <Loader2 size={20} className="animate-spin mr-2" /> Cargando diagrama...
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-[#6B7280]">
        Workflow no encontrado
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="relative w-full h-[calc(100vh-200px)] rounded-xl border border-[#1E2330] bg-[#0A0D12] overflow-hidden">
        {/* Toolbar para agregar nodos */}
        {!readOnly && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 p-1.5 bg-[#141820] border border-[#1E2330] rounded-lg shadow-lg">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest px-2">Agregar:</span>
            <ToolbarButton onClick={() => addNode('trigger', 'Nuevo disparador', 'sparkles', '#8B5CF6')} icon={Sparkles} label="Trigger" />
            <ToolbarButton onClick={() => addNode('stage', 'Nueva etapa', 'target', '#3B82F6')} icon={CheckCircle2} label="Etapa" />
            <ToolbarButton onClick={() => addNode('document', 'Documento', 'file-text', '#FF6600')} icon={FileText} label="Doc" />
            <ToolbarButton onClick={() => addNode('action', 'Acción', 'zap', '#10B981')} icon={Zap} label="Acción" />
            <ToolbarButton onClick={() => addNode('condition', 'Condición', 'branch', '#F59E0B')} icon={GitBranch} label="If" />
            <ToolbarButton onClick={() => addNode('note', 'Nota', 'message', '#6B7280')} icon={MessageSquare} label="Nota" />
          </div>
        )}

        {/* Title pill */}
        <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg bg-[#141820] border border-[#1E2330] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-[#F0F2F5]">{workflow.name}</span>
          {workflow.is_template && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">
              PLANTILLA
            </span>
          )}
        </div>

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={readOnly ? undefined : onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={readOnly ? undefined : onNodeDragStop}
          onEdgesDelete={readOnly ? undefined : onEdgesDelete}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={true}
          deleteKeyCode={readOnly ? null : 'Delete'}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#1E2330" />
          <Controls
            position="bottom-right"
            className="!bg-[#141820] !border-[#1E2330]"
          />
          <MiniMap
            nodeColor={(n) => (n.data as { color?: string }).color ?? '#FF6600'}
            className="!bg-[#0F1218] !border !border-[#1E2330]"
            maskColor="rgba(10,13,18,0.8)"
          />
        </ReactFlow>

        {/* Inspector lateral */}
        {!readOnly && selectedNode && (
          <NodeInspector
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onSave={handleSaveSelectedNode}
            onDelete={handleDeleteSelectedNode}
          />
        )}
      </div>
    </ReactFlowProvider>
  )
}

// ---------------------------------------------------------------
// HELPERS — convertir entre WorkflowNode/Edge y el formato de RF
// ---------------------------------------------------------------
function nodeToRf(n: WorkflowNode): Node {
  return {
    id: n.id,
    type: 'custom',
    position: { x: Number(n.position_x) || 0, y: Number(n.position_y) || 0 },
    data: {
      label: n.label,
      description: n.description,
      icon: n.icon,
      color: n.color,
      status: n.status,
      node_type: n.node_type,
      notes: n.notes,
      attachments_count: Array.isArray(n.attachments) ? n.attachments.length : 0,
    },
  }
}

function edgeToRf(e: WorkflowEdge): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle ?? undefined,
    targetHandle: e.target_handle ?? undefined,
    label: e.label ?? undefined,
    type: e.edge_type || 'smoothstep',
    animated: e.animated || false,
    style: { stroke: '#FF6600', strokeWidth: 2 },
  }
}

function ToolbarButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Plus; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#1E2330] transition-colors"
      title={label}
    >
      <Icon size={12} />
      <span>{label}</span>
    </button>
  )
}
