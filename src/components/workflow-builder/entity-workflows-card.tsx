'use client'

/**
 * Tarjeta que muestra los workflows visuales de una entidad
 * (cliente, OC, oportunidad, etc.) para mostrarse en su pantalla de detalle.
 *
 * Se usa así:
 *   <EntityWorkflowsCard entityType="client" entityId={clientId} entityName={clientName} />
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Workflow, Plus, ArrowRight, Eye, Sparkles, Loader2,
} from 'lucide-react'
import {
  listWorkflows, createWorkflowFromTemplate, type VisualWorkflow, type WorkflowScope,
} from '@/lib/visual-workflow'

interface Props {
  entityType: 'client' | 'opportunity' | 'order' | 'sat' | string
  entityId: string
  entityName?: string
  /** Empresa actual para asociar a workflows nuevos */
  companyId?: string
  /** Si no hay workflows, mostrar el panel de "crear" en lugar de un mensaje vacío */
  emptyAsAction?: boolean
}

export function EntityWorkflowsCard({
  entityType, entityId, entityName, companyId, emptyAsAction = true,
}: Props) {
  const router = useRouter()
  const { addToast } = useToast()
  const [workflows, setWorkflows] = useState<VisualWorkflow[]>([])
  const [templates, setTemplates] = useState<VisualWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTemplate, setNewTemplate] = useState('')
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [wfs, tpls] = await Promise.all([
      listWorkflows({ entity_type: entityType, entity_id: entityId }),
      listWorkflows({ is_template: true }),
    ])
    setWorkflows(wfs)
    setTemplates(tpls)
    setLoading(false)
  }, [entityType, entityId])

  useEffect(() => { reload() }, [reload])

  const handleCreate = async () => {
    if (!newName.trim()) { addToast({ type: 'warning', title: 'Falta el nombre' }); return }
    setCreating(true)
    try {
      const id = await createWorkflowFromTemplate({
        templateId: newTemplate || undefined,
        name: newName,
        scope: (entityType as WorkflowScope) ?? 'custom',
        entity_type: entityType,
        entity_id: entityId,
        company_id: companyId,
      })
      addToast({ type: 'success', title: 'Workflow creado' })
      router.push(`/workflows/${id}`)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setCreating(false)
    }
  }

  const openNew = () => {
    setNewName(entityName ? `Flujo · ${entityName}` : 'Nuevo flujo')
    setNewTemplate('')
    setShowNew(true)
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-4 flex items-center gap-2 text-xs text-[#6B7280]">
        <Loader2 size={12} className="animate-spin" /> Cargando workflows...
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest flex items-center gap-2">
          <Workflow size={12} className="text-[#FF6600]" /> Flujos visuales ({workflows.length})
        </h3>
        <Button variant="outline" size="sm" onClick={openNew}>
          <Plus size={12} /> Nuevo flujo
        </Button>
      </div>

      {workflows.length === 0 ? (
        emptyAsAction ? (
          <button
            onClick={openNew}
            className="w-full rounded-lg border-2 border-dashed border-[#2A3040] hover:border-[#FF6600]/40 px-4 py-6 text-center transition-colors group"
          >
            <Sparkles size={18} className="mx-auto text-[#6B7280] group-hover:text-[#FF6600] mb-2" />
            <p className="text-sm text-[#9CA3AF] group-hover:text-[#F0F2F5]">
              Crear un flujo visual{entityName ? ` para ${entityName}` : ''}
            </p>
            <p className="text-[11px] text-[#6B7280] mt-1">
              Diagrama estilo Make/n8n con notas, archivos y próximos pasos
            </p>
          </button>
        ) : (
          <p className="text-xs text-[#6B7280] italic">Sin flujos asociados.</p>
        )
      ) : (
        <div className="space-y-2">
          {workflows.map(wf => (
            <Link
              key={wf.id}
              href={`/workflows/${wf.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/30 transition-colors group"
            >
              <div className="w-8 h-8 rounded-md bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center shrink-0">
                <Workflow size={14} className="text-[#FF6600]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#F0F2F5] truncate group-hover:text-[#FF6600]">
                  {wf.name}
                </p>
                <p className="text-[10px] text-[#6B7280]">
                  Modificado {new Date(wf.updated_at).toLocaleDateString('es-AR')}
                </p>
              </div>
              <Eye size={14} className="text-[#6B7280] group-hover:text-[#FF6600] shrink-0" />
              <ArrowRight size={14} className="text-[#6B7280] group-hover:text-[#FF6600] shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Modal de creación */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuevo flujo visual" size="md">
        <div className="space-y-4">
          <Input
            label="Nombre del flujo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej: Flujo Cotización a Cobro - Nordex"
          />

          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Empezar desde plantilla (opcional)</label>
            <Select
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              options={[
                { value: '', label: 'Vacío (Lead-to-Cash estándar)' },
                ...templates.map(t => ({ value: t.id, label: `📋 ${t.name}` })),
              ]}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={creating}>
              <Plus size={14} /> Crear y abrir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
