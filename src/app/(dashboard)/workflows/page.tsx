'use client'

/**
 * Listado de Workflows visuales (estilo Make / n8n).
 *
 * Muestra dos pestañas:
 *   - Mis flujos: workflows en uso (instancias vinculadas a clientes/OCs)
 *   - Plantillas: workflows reutilizables que pueden clonarse
 *
 * Permite crear flujos vacíos o desde plantilla.
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
  GitBranch, Plus, Workflow, Clock, Sparkles,
  Layers, ArrowRight, Trash2,
} from 'lucide-react'
import { listWorkflows, createWorkflow, createWorkflowFromTemplate, deleteWorkflow, type VisualWorkflow, type WorkflowScope } from '@/lib/visual-workflow'
import { useCompanyContext } from '@/lib/company-context'

export default function WorkflowsPage() {
  const { activeCompany } = useCompanyContext()
  const { addToast } = useToast()
  const router = useRouter()

  const [tab, setTab] = useState<'mine' | 'templates'>('mine')
  const [workflows, setWorkflows] = useState<VisualWorkflow[]>([])
  const [templates, setTemplates] = useState<VisualWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)

  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<WorkflowScope>('custom')
  const [newFromTemplate, setNewFromTemplate] = useState<string>('00000000-0000-0000-0000-000000000002')
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [mine, tpls] = await Promise.all([
      listWorkflows({ is_template: false }),
      listWorkflows({ is_template: true }),
    ])
    setWorkflows(mine)
    setTemplates(tpls)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleCreate = async () => {
    if (!newName.trim()) { addToast({ type: 'warning', title: 'Falta el nombre' }); return }
    setCreating(true)
    try {
      let id: string
      if (newFromTemplate) {
        id = await createWorkflowFromTemplate({
          templateId: newFromTemplate,
          name: newName,
          scope: newScope,
          entity_type: 'manual',
          entity_id: crypto.randomUUID(),
          company_id: activeCompany?.id,
        })
      } else {
        const wf = await createWorkflow({
          name: newName,
          scope: newScope,
          company_id: activeCompany?.id,
        })
        id = wf.id
      }
      addToast({ type: 'success', title: 'Workflow creado' })
      router.push(`/workflows/${id}`)
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el workflow "${name}"?`)) return
    try {
      await deleteWorkflow(id)
      addToast({ type: 'success', title: 'Workflow eliminado' })
      reload()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  const list = tab === 'mine' ? workflows : templates

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5] flex items-center gap-2">
            <Workflow size={22} className="text-[#FF6600]" />
            Workflows visuales
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Diseñá flujos drag-and-drop estilo Make / n8n. Cada nodo puede tener notas y archivos adjuntos.
          </p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={14} /> Nuevo flujo
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1E2330]">
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          <Layers size={12} /> Mis flujos
          <span className="ml-1.5 text-[10px] px-1.5 py-0 rounded bg-[#1E2330] text-[#9CA3AF]">{workflows.length}</span>
        </TabButton>
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>
          <Sparkles size={12} /> Plantillas
          <span className="ml-1.5 text-[10px] px-1.5 py-0 rounded bg-violet-500/15 text-violet-400">{templates.length}</span>
        </TabButton>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-[#141820] border border-[#1E2330] animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-10 text-center">
          <GitBranch size={28} className="mx-auto text-[#3A4050] mb-3" />
          <p className="text-sm text-[#9CA3AF]">
            {tab === 'mine'
              ? 'Todavía no hay workflows creados.'
              : 'No hay plantillas disponibles.'
            }
          </p>
          {tab === 'mine' && (
            <Button size="sm" onClick={() => setShowNewModal(true)} className="mt-3">
              <Plus size={12} /> Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map(wf => (
            <WorkflowCard key={wf.id} wf={wf} onDelete={() => handleDelete(wf.id, wf.name)} />
          ))}
        </div>
      )}

      {/* New workflow modal */}
      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Nuevo workflow visual" size="md">
        <div className="space-y-4">
          <Input
            label="Nombre del flujo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej: Cotización a Cobro - Cliente Nordex"
          />

          <Select
            label="Tipo / scope"
            value={newScope}
            onChange={(e) => setNewScope(e.target.value as WorkflowScope)}
            options={[
              { value: 'custom',      label: '🧩 Personalizado' },
              { value: 'client',      label: '👤 Por cliente' },
              { value: 'opportunity', label: '🎯 Oportunidad' },
              { value: 'order',       label: '📦 OC / Pedido' },
              { value: 'sat',         label: '🔧 SAT' },
            ]}
          />

          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Empezar desde plantilla (opcional)</label>
            <Select
              value={newFromTemplate}
              onChange={(e) => setNewFromTemplate(e.target.value)}
              options={[
                { value: '', label: 'Vacío — sin nodos (canvas en blanco)' },
                ...templates.map(t => ({ value: t.id, label: `📋 ${t.name}` })),
              ]}
            />
            <p className="text-[10px] text-[#6B7280] mt-1">Elegí una plantilla para arrancar con nodos pre-armados, o &quot;Vacío&quot; para diseñar desde cero.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={creating}>
              <Plus size={14} /> Crear y abrir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------
// Components
// ---------------------------------------------------------------

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
        active
          ? 'text-[#FF6600] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FF6600]'
          : 'text-[#9CA3AF] hover:text-[#F0F2F5]'
      }`}
    >
      {children}
    </button>
  )
}

const SCOPE_LABEL: Record<WorkflowScope, { label: string; emoji: string }> = {
  custom:      { label: 'Personalizado', emoji: '🧩' },
  client:      { label: 'Cliente',       emoji: '👤' },
  opportunity: { label: 'Oportunidad',   emoji: '🎯' },
  order:       { label: 'OC / Pedido',   emoji: '📦' },
  sat:         { label: 'SAT',           emoji: '🔧' },
}

function WorkflowCard({ wf, onDelete }: { wf: VisualWorkflow; onDelete: () => void }) {
  const scope = SCOPE_LABEL[wf.scope] ?? { label: wf.scope, emoji: '📄' }

  return (
    <div className="group relative rounded-xl border border-[#1E2330] bg-[#141820] p-4 hover:border-[#FF6600]/30 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-[#FF6600]/10 border border-[#FF6600]/20 flex items-center justify-center shrink-0 text-base">
          {scope.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/workflows/${wf.id}`} className="block">
            <h3 className="text-sm font-semibold text-[#F0F2F5] truncate hover:text-[#FF6600] transition-colors">
              {wf.name}
            </h3>
            {wf.description && (
              <p className="text-xs text-[#6B7280] line-clamp-2 mt-0.5">{wf.description}</p>
            )}
          </Link>
        </div>
        {!wf.is_template && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 text-[#6B7280] hover:text-red-400 transition-all"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-[#6B7280]">
        <span className="px-1.5 py-0.5 rounded bg-[#0F1218] border border-[#1E2330]">{scope.label}</span>
        <span className="flex items-center gap-1"><Clock size={10} /> {new Date(wf.updated_at).toLocaleDateString('es-AR')}</span>
        {wf.is_template && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30 font-semibold">
            PLANTILLA
          </span>
        )}
      </div>

      <Link
        href={`/workflows/${wf.id}`}
        className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-semibold text-[#FF6600]"
      >
        Abrir <ArrowRight size={10} />
      </Link>
    </div>
  )
}
