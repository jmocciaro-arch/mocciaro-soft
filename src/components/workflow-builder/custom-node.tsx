'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import {
  Sparkles, Target, FileText, Upload, Package, Truck, CreditCard, DollarSign,
  CheckCircle2, GitBranch, FileQuestion, Zap, Box, Wrench, MessageSquare,
  Mail, Loader2, AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  target: Target,
  'file-text': FileText,
  upload: Upload,
  package: Package,
  truck: Truck,
  'credit-card': CreditCard,
  'dollar-sign': DollarSign,
  'check-circle': CheckCircle2,
  branch: GitBranch,
  question: FileQuestion,
  zap: Zap,
  box: Box,
  wrench: Wrench,
  message: MessageSquare,
  mail: Mail,
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon?: LucideIcon }> = {
  pending:     { label: 'Pendiente',  className: 'bg-[#1E2330] text-[#9CA3AF] border-[#2A3040]' },
  in_progress: { label: 'En curso',   className: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: Loader2 },
  completed:   { label: 'Completado', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  skipped:     { label: 'Saltado',    className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
  blocked:     { label: 'Bloqueado',  className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  failed:      { label: 'Falló',      className: 'bg-red-500/15 text-red-400 border-red-500/30', icon: AlertTriangle },
}

export interface CustomNodeData extends Record<string, unknown> {
  label: string
  description?: string | null
  icon?: string | null
  color?: string
  status?: string
  node_type?: string
  notes?: string | null
  attachments_count?: number
  selected?: boolean
}

export function CustomNode({ data, selected }: NodeProps) {
  const d = data as CustomNodeData
  const Icon = (d.icon ? ICON_MAP[d.icon] : undefined) ?? Zap
  const color = d.color || '#FF6600'
  const statusKey = d.status || 'pending'
  const statusBadge = STATUS_BADGE[statusKey] ?? STATUS_BADGE.pending
  const StatusIcon = statusBadge.icon

  const hasNotes = !!d.notes && d.notes.trim().length > 0
  const attachmentsCount = d.attachments_count ?? 0

  return (
    <div
      className={cn(
        'group relative rounded-xl border-2 bg-[#141820] min-w-[180px] max-w-[240px]',
        'shadow-lg shadow-black/40 transition-all',
        selected ? 'border-[#FF6600] shadow-orange-500/30' : 'border-[#2A3040] hover:border-[#3A4050]',
      )}
      style={{
        boxShadow: selected
          ? `0 0 0 2px ${color}66, 0 8px 20px rgba(0,0,0,0.4)`
          : undefined,
      }}
    >
      {/* Top handle (target) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-[#1E2330] !border-2 !border-[#FF6600]"
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-[10px] border-b border-[#1E2330]"
        style={{ background: `linear-gradient(to right, ${color}25, transparent)` }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}30`, color }}
        >
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#F0F2F5] truncate">{d.label}</p>
          {d.node_type && d.node_type !== 'stage' && (
            <p className="text-[9px] text-[#6B7280] uppercase tracking-wider font-medium">{d.node_type}</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        {d.description && (
          <p className="text-[11px] text-[#9CA3AF] line-clamp-2 leading-snug">{d.description}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium',
            statusBadge.className
          )}>
            {StatusIcon && <StatusIcon size={9} className={statusKey === 'in_progress' ? 'animate-spin' : ''} />}
            {statusBadge.label}
          </span>

          <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280]">
            {hasNotes && (
              <span className="inline-flex items-center gap-0.5" title="Tiene notas">
                <MessageSquare size={9} />
              </span>
            )}
            {attachmentsCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`${attachmentsCount} adjuntos`}>
                📎 {attachmentsCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-[#1E2330] !border-2 !border-[#FF6600]"
      />
    </div>
  )
}
