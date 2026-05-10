'use client'

import { useEffect, useState } from 'react'
import {
  X, Save, Trash2, FileText, Upload, Paperclip,
  Sparkles, Target, Package, Truck, CreditCard, DollarSign,
  CheckCircle2, GitBranch, Zap, Box, Wrench, MessageSquare, Mail,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { WorkflowNode, NodeType, NodeStatus, WorkflowAttachment } from '@/lib/visual-workflow'

const NODE_TYPES: Array<{ value: NodeType; label: string; description: string }> = [
  { value: 'trigger',     label: 'Disparador',  description: 'Inicia el flujo (ej: nuevo lead)' },
  { value: 'stage',       label: 'Etapa',       description: 'Punto de control del proceso' },
  { value: 'document',    label: 'Documento',   description: 'Cotización, pedido, factura...' },
  { value: 'action',      label: 'Acción',      description: 'Algo que se ejecuta (ej: enviar mail)' },
  { value: 'condition',   label: 'Condición',   description: 'Bifurcación if/else' },
  { value: 'approval',    label: 'Aprobación',  description: 'Requiere validación humana' },
  { value: 'note',        label: 'Nota',        description: 'Bloque informativo (no ejecuta nada)' },
  { value: 'integration', label: 'Integración', description: 'Llama a un sistema externo' },
]

const STATUSES: Array<{ value: NodeStatus; label: string }> = [
  { value: 'pending',     label: 'Pendiente' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'completed',   label: 'Completado' },
  { value: 'skipped',     label: 'Saltado' },
  { value: 'blocked',     label: 'Bloqueado' },
  { value: 'failed',      label: 'Falló' },
]

const ICONS: Array<{ value: string; label: string; Icon: LucideIcon }> = [
  { value: 'sparkles',    label: 'Inicio',       Icon: Sparkles },
  { value: 'target',      label: 'Objetivo',     Icon: Target },
  { value: 'file-text',   label: 'Documento',    Icon: FileText },
  { value: 'upload',      label: 'Subir',        Icon: Upload },
  { value: 'package',     label: 'Pedido',       Icon: Package },
  { value: 'truck',       label: 'Entrega',      Icon: Truck },
  { value: 'credit-card', label: 'Pago',         Icon: CreditCard },
  { value: 'dollar-sign', label: 'Cobro',        Icon: DollarSign },
  { value: 'check-circle', label: 'Aprobación',  Icon: CheckCircle2 },
  { value: 'branch',      label: 'Bifurcación',  Icon: GitBranch },
  { value: 'mail',        label: 'Email',        Icon: Mail },
  { value: 'box',         label: 'Stock',        Icon: Box },
  { value: 'wrench',      label: 'SAT',          Icon: Wrench },
  { value: 'zap',         label: 'Acción',       Icon: Zap },
  { value: 'message',     label: 'Nota',         Icon: MessageSquare },
]

const PRESET_COLORS = ['#FF6600', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899']

interface Props {
  node: WorkflowNode | null
  onClose: () => void
  onSave: (patch: Partial<WorkflowNode>) => Promise<void>
  onDelete: () => Promise<void>
}

export function NodeInspector({ node, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Partial<WorkflowNode>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (node) {
      setDraft({
        label: node.label,
        description: node.description,
        node_type: node.node_type,
        status: node.status,
        icon: node.icon,
        color: node.color,
        notes: node.notes,
        attachments: node.attachments,
      })
    }
  }, [node])

  if (!node) return null

  const update = <K extends keyof WorkflowNode>(field: K, value: WorkflowNode[K]) => {
    setDraft(d => ({ ...d, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(draft); onClose() } finally { setSaving(false) }
  }

  const addAttachmentByUrl = () => {
    const url = window.prompt('Pegá la URL del archivo (Google Drive, Dropbox, etc.)')
    if (!url) return
    const name = window.prompt('Nombre del archivo:', url.split('/').pop() || 'archivo')
    if (!name) return
    const newAtt: WorkflowAttachment = {
      id: crypto.randomUUID(),
      name,
      url,
      size: 0,
      type: 'link',
      uploaded_at: new Date().toISOString(),
    }
    update('attachments', [...(draft.attachments ?? []), newAtt])
  }

  const removeAttachment = (id: string) => {
    update('attachments', (draft.attachments ?? []).filter(a => a.id !== id))
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[380px] bg-[#0F1218] border-l border-[#1E2330] shadow-2xl shadow-black/40 flex flex-col z-20 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2330]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: draft.color || '#FF6600' }} />
          <h3 className="text-sm font-semibold text-[#F0F2F5]">Editar nodo</h3>
        </div>
        <button onClick={onClose} className="text-[#6B7280] hover:text-[#F0F2F5] transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Input
          label="Título"
          value={draft.label ?? ''}
          onChange={(e) => update('label', e.target.value)}
        />

        <div>
          <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Descripción</label>
          <textarea
            value={draft.description ?? ''}
            onChange={(e) => update('description', e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-[#0F1218] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
            placeholder="¿Qué hace este nodo?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo"
            options={NODE_TYPES.map(t => ({ value: t.value, label: t.label }))}
            value={draft.node_type ?? 'stage'}
            onChange={(e) => update('node_type', e.target.value as NodeType)}
          />
          <Select
            label="Estado"
            options={STATUSES.map(s => ({ value: s.value, label: s.label }))}
            value={draft.status ?? 'pending'}
            onChange={(e) => update('status', e.target.value as NodeStatus)}
          />
        </div>

        {/* Icon picker */}
        <div>
          <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Ícono</label>
          <div className="grid grid-cols-7 gap-1.5">
            {ICONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => update('icon', value)}
                title={label}
                className={`p-2 rounded-md border transition-colors ${
                  draft.icon === value
                    ? 'bg-[#FF6600]/15 border-[#FF6600]/40 text-[#FF6600]'
                    : 'border-[#1E2330] text-[#6B7280] hover:border-[#2A3040] hover:text-[#9CA3AF]'
                }`}
              >
                <Icon size={14} className="mx-auto" />
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => update('color', c)}
                title={c}
                className={`w-7 h-7 rounded-md border-2 transition-transform hover:scale-110 ${
                  draft.color === c ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 flex items-center gap-1.5">
            <MessageSquare size={12} /> Notas
          </label>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-[#0F1218] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:border-[#FF6600]/50"
            placeholder="Lo que tengas que recordar de este paso (markdown soportado)"
          />
        </div>

        {/* Adjuntos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[#9CA3AF] flex items-center gap-1.5">
              <Paperclip size={12} /> Adjuntos ({(draft.attachments ?? []).length})
            </label>
            <button
              onClick={addAttachmentByUrl}
              className="text-[10px] text-[#FF6600] hover:text-[#FF7711] font-medium"
            >
              + Agregar link
            </button>
          </div>
          <div className="space-y-1.5">
            {(draft.attachments ?? []).map(att => (
              <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#141820] border border-[#1E2330]">
                <FileText size={12} className="text-[#9CA3AF] shrink-0" />
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F0F2F5] hover:text-[#FF6600] truncate flex-1">
                  {att.name}
                </a>
                <button onClick={() => removeAttachment(att.id)} className="text-[#6B7280] hover:text-red-400">
                  <X size={12} />
                </button>
              </div>
            ))}
            {(draft.attachments ?? []).length === 0 && (
              <p className="text-[11px] text-[#4B5563] italic">Sin adjuntos. Pegá un link de Drive/Dropbox.</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#1E2330] flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDelete} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
          <Trash2 size={12} /> Eliminar
        </Button>
        <Button onClick={handleSave} loading={saving} size="sm" className="ml-auto">
          <Save size={12} /> Guardar
        </Button>
      </div>
    </div>
  )
}
