'use client'

/**
 * Actividad — Feed global cronológico estilo Salesforce / GitHub.
 * Consolida tt_activity_log + tt_oc_audit_log + creación/edición de docs.
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Activity, RefreshCw, User, FileText, Trash2, CheckCircle2, XCircle,
  Plus, Edit3, Filter, Calendar,
} from 'lucide-react'

interface FeedItem {
  id: string
  source: 'activity' | 'oc_audit'
  entity_type: string
  entity_id: string
  action: string
  description: string | null
  user_name: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

const ACTION_TONES: Record<string, string> = {
  created:               'emerald',
  updated:               'blue',
  deleted:               'red',
  deletion_requested:    'orange',
  deletion_approved:     'red',
  deletion_rejected:     'gray',
  matched:               'violet',
  converted:             'emerald',
  approved:              'emerald',
  rejected:              'red',
  default:               'gray',
}

const ENTITY_LABELS: Record<string, string> = {
  client:        'Cliente',
  client_contact:'Contacto',
  document:      'Documento',
  oc_parsed:     'OC',
  product:       'Producto',
  company:       'Empresa',
  inv_movement:  'Movimiento',
}

export default function ActividadPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('week')
  const [entityFilter, setEntityFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const fromDate = filter === 'today' ? new Date(Date.now() - 24 * 3600e3) :
                     filter === 'week'  ? new Date(Date.now() - 7  * 24 * 3600e3) :
                     filter === 'month' ? new Date(Date.now() - 30 * 24 * 3600e3) :
                     new Date(Date.now() - 365 * 24 * 3600e3)
    const fromIso = fromDate.toISOString()

    const [act, oc] = await Promise.all([
      sb.from('tt_activity_log')
        .select('*, user:tt_users(name)')
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(100),
      sb.from('tt_oc_audit_log')
        .select('*, user:tt_users(name)')
        .gte('created_at', fromIso)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const all: FeedItem[] = []
    for (const r of (act.data || []) as Array<Record<string, unknown>>) {
      all.push({
        id: r.id as string,
        source: 'activity',
        entity_type: r.entity_type as string,
        entity_id: r.entity_id as string,
        action: r.action as string,
        description: r.description as string | null,
        user_name: ((r.user as { name?: string } | null)?.name) || null,
        created_at: r.created_at as string,
        metadata: r.metadata as Record<string, unknown> | null,
      })
    }
    for (const r of (oc.data || []) as Array<Record<string, unknown>>) {
      all.push({
        id: r.id as string,
        source: 'oc_audit',
        entity_type: 'oc_parsed',
        entity_id: r.oc_parsed_id as string,
        action: r.action as string,
        description: (r.reason as string) || (r.notes as string) || null,
        user_name: ((r.user as { name?: string } | null)?.name) || null,
        created_at: r.created_at as string,
        metadata: r.snapshot as Record<string, unknown> | null,
      })
    }

    all.sort((a, b) => b.created_at.localeCompare(a.created_at))
    setItems(entityFilter ? all.filter(x => x.entity_type === entityFilter) : all)
    setLoading(false)
  }, [filter, entityFilter])

  useEffect(() => { void load() }, [load])

  // Agrupar por día
  const grouped = items.reduce((acc, it) => {
    const day = new Date(it.created_at).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'short' })
    if (!acc[day]) acc[day] = []
    acc[day].push(it)
    return acc
  }, {} as Record<string, FeedItem[]>)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5] flex items-center gap-2">
            <Activity size={22} className="text-[#FF6600]" /> Actividad
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Timeline de todas las acciones del sistema (auditoría completa).
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refrescar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-[#1E2330] bg-[#0F1218] overflow-hidden">
          {[
            { id: 'today', label: 'Hoy' },
            { id: 'week',  label: 'Semana' },
            { id: 'month', label: 'Mes' },
            { id: 'all',   label: 'Año' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as 'all' | 'today' | 'week' | 'month')}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                filter === f.id ? 'bg-[#FF6600] text-white' : 'text-[#9CA3AF] hover:text-[#F0F2F5]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-[#6B7280]" />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="h-8 rounded bg-[#1E2330] border border-[#2A3040] px-2 text-xs text-[#F0F2F5] focus:outline-none"
          >
            <option value="">Todas las entidades</option>
            <option value="client">Clientes</option>
            <option value="document">Documentos</option>
            <option value="oc_parsed">OCs</option>
            <option value="product">Productos</option>
            <option value="company">Empresas</option>
          </select>
        </div>
        <span className="text-xs text-[#6B7280]">{items.length} eventos</span>
      </div>

      {/* Timeline agrupado por día */}
      {loading ? (
        <div className="text-center py-12 text-[#6B7280]">Cargando timeline...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2A3040] bg-[#0A0D12] p-12 text-center">
          <Activity size={32} className="text-[#3A4050] mx-auto mb-3" />
          <p className="text-sm text-[#6B7280]">Sin actividad en este período</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayItems]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-3 sticky top-0 bg-[#0B0E13] py-1 z-10">
                <Calendar size={14} className="text-[#FF6600]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF6600]">{day}</h3>
                <span className="text-[10px] text-[#6B7280]">({dayItems.length})</span>
                <div className="flex-1 h-px bg-[#1E2330]" />
              </div>
              <div className="relative pl-8 space-y-2 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-[#1E2330]">
                {dayItems.map(item => (
                  <FeedRow key={`${item.source}-${item.id}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const tone = ACTION_TONES[item.action] || ACTION_TONES.default
  const ToneClass = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    blue:    'bg-blue-500/10 border-blue-500/30 text-blue-400',
    red:     'bg-red-500/10 border-red-500/30 text-red-400',
    orange:  'bg-orange-500/10 border-orange-500/30 text-orange-400',
    violet:  'bg-violet-500/10 border-violet-500/30 text-violet-400',
    gray:    'bg-gray-500/10 border-gray-500/30 text-gray-400',
  }[tone]

  const Icon = {
    created: Plus, updated: Edit3, deleted: Trash2,
    deletion_requested: Activity, deletion_approved: Trash2, deletion_rejected: XCircle,
    matched: CheckCircle2, converted: CheckCircle2, approved: CheckCircle2, rejected: XCircle,
  }[item.action] || Activity

  const time = new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="relative group">
      <div className={`absolute -left-[1.625rem] top-3 w-3 h-3 rounded-full border-2 ${ToneClass} ring-4 ring-[#0B0E13]`} />
      <div className="rounded-lg bg-[#0F1218] border border-[#1E2330] p-3 hover:border-[#2A3040] transition">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${ToneClass}`}>
            <Icon size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" size="sm">{ENTITY_LABELS[item.entity_type] || item.entity_type}</Badge>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#9CA3AF]">{item.action}</span>
              <span className="text-[10px] text-[#6B7280]">·</span>
              <span className="text-[10px] text-[#6B7280] flex items-center gap-1">
                <User size={9} /> {item.user_name || 'Sistema'}
              </span>
              <span className="text-[10px] text-[#4B5563] ml-auto font-mono">{time}</span>
            </div>
            {item.description && (
              <p className="text-xs text-[#D1D5DB] mt-1.5 leading-relaxed">{item.description}</p>
            )}
            <p className="text-[10px] text-[#4B5563] mt-1 font-mono truncate">ID: {item.entity_id?.slice(0, 8)}…</p>
          </div>
        </div>
      </div>
    </div>
  )
}
