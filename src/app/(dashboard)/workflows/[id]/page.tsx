'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Edit3, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { getWorkflow, updateWorkflow, type VisualWorkflow } from '@/lib/visual-workflow'

// El canvas usa @xyflow/react que toca window — render solo en cliente
const WorkflowCanvas = dynamic(
  () => import('@/components/workflow-builder/workflow-canvas').then(m => m.WorkflowCanvas),
  { ssr: false, loading: () => <div className="h-[60vh] rounded-xl bg-[#141820] border border-[#1E2330] animate-pulse" /> }
)

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { addToast } = useToast()

  const [workflow, setWorkflow] = useState<VisualWorkflow | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    getWorkflow(id).then(({ workflow }) => {
      setWorkflow(workflow)
      if (workflow) {
        setName(workflow.name)
        setDescription(workflow.description ?? '')
      }
    })
  }, [id])

  const handleSaveMeta = async () => {
    try {
      await updateWorkflow(id, { name, description })
      setWorkflow(w => w ? { ...w, name, description } : w)
      setEditing(false)
      addToast({ type: 'success', title: 'Workflow actualizado' })
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  if (!workflow) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-[#141820] rounded animate-pulse" />
        <div className="h-[60vh] rounded-xl bg-[#141820] border border-[#1E2330] animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Breadcrumbs + título */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => router.push('/workflows')}
            className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F0F2F5] mb-2"
          >
            <ArrowLeft size={12} /> Volver a Workflows
          </button>

          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del workflow"
                className="text-lg"
              />
              <Button size="sm" onClick={handleSaveMeta}><Save size={12} /> Guardar</Button>
              <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setName(workflow.name); setDescription(workflow.description ?? '') }}>
                <X size={12} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[#F0F2F5]">{workflow.name}</h1>
              <button onClick={() => setEditing(true)} className="text-[#6B7280] hover:text-[#FF6600]">
                <Edit3 size={14} />
              </button>
            </div>
          )}
          {!editing && workflow.description && (
            <p className="text-sm text-[#9CA3AF] mt-1">{workflow.description}</p>
          )}
          {editing && (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción..."
              rows={2}
              className="mt-2 w-full rounded-lg bg-[#0F1218] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
            />
          )}
        </div>
      </div>

      {/* Help banner */}
      <div className="rounded-lg bg-[#FF6600]/5 border border-[#FF6600]/20 px-4 py-2.5 text-xs text-[#9CA3AF] flex items-center gap-2">
        <span className="font-semibold text-[#FF6600]">💡 Tip:</span>
        Arrastrá los nodos para moverlos · Click para editar · Conectá arrastrando del punto naranja al siguiente nodo · DEL para borrar
      </div>

      {/* Canvas */}
      <WorkflowCanvas workflowId={id} />
    </div>
  )
}
