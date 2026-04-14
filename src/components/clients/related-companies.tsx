'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useToast } from '@/components/ui/toast'
import { Link2, Plus, Trash2, Loader2, Building2 } from 'lucide-react'

type Row = Record<string, unknown>

interface RelatedCompaniesProps {
  clientId: string
  clientName: string
}

const RELATION_TYPES = [
  { value: 'transportista', label: 'Transportista' },
  { value: 'despachante', label: 'Despachante' },
  { value: 'empresa_hermana', label: 'Empresa hermana' },
  { value: 'representante', label: 'Representante' },
  { value: 'proveedor', label: 'Proveedor' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'agente', label: 'Agente' },
  { value: 'otro', label: 'Otro' },
]

const RELATION_COLORS: Record<string, string> = {
  transportista: '#3B82F6',
  despachante: '#8B5CF6',
  empresa_hermana: '#F59E0B',
  representante: '#10B981',
  proveedor: '#EF4444',
  distribuidor: '#F97316',
  agente: '#06B6D4',
  otro: '#6B7280',
}

export function RelatedCompanies({ clientId, clientName }: RelatedCompaniesProps) {
  const { addToast } = useToast()
  const [relations, setRelations] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [relationType, setRelationType] = useState('transportista')
  const [relatedClientId, setRelatedClientId] = useState('')
  const [saving, setSaving] = useState(false)

  const didLoad = useRef(false)
  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    const load = async () => {
      const sb = createClient()
      // Get relations where this client is either side
      const { data: rels1 } = await sb
        .from('tt_client_relations')
        .select('*, related:related_client_id(id, name)')
        .eq('client_id', clientId)

      const { data: rels2 } = await sb
        .from('tt_client_relations')
        .select('*, related:client_id(id, name)')
        .eq('related_client_id', clientId)

      // Merge both sides
      const all = [
        ...(rels1 || []).map(r => ({ ...r, direction: 'outgoing', company: r.related })),
        ...(rels2 || []).map(r => ({ ...r, direction: 'incoming', company: r.related })),
      ]
      setRelations(all)
      setLoading(false)
    }
    load()
  }, [clientId])

  const searchClients = async (query: string) => {
    const sb = createClient()
    const { data } = await sb
      .from('tt_clients')
      .select('id, name')
      .eq('active', true)
      .neq('id', clientId)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(20)
    // Dedup by name
    const seen = new Map<string, string>()
    for (const c of (data || [])) {
      const name = (c.name as string).trim().toLowerCase()
      if (!seen.has(name)) seen.set(name, c.id as string)
    }
    return Array.from(seen.entries()).map(([, id]) => {
      const orig = (data || []).find(c => c.id === id)
      return { value: id, label: (orig?.name as string) || '' }
    })
  }

  const addRelation = async () => {
    if (!relatedClientId || !relationType) return
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('tt_client_relations').insert({
      client_id: clientId,
      related_client_id: relatedClientId,
      relation_type: relationType,
    })
    if (error) {
      if (error.code === '23505') {
        addToast({ type: 'warning', title: 'Esta relacion ya existe' })
      } else {
        addToast({ type: 'error', title: 'Error', message: error.message })
      }
    } else {
      addToast({ type: 'success', title: 'Empresa relacionada agregada' })
      // Reload
      didLoad.current = false
      setLoading(true)
      setRelations([])
      const loadAgain = async () => {
        const { data: rels1 } = await sb.from('tt_client_relations').select('*, related:related_client_id(id, name)').eq('client_id', clientId)
        const { data: rels2 } = await sb.from('tt_client_relations').select('*, related:client_id(id, name)').eq('related_client_id', clientId)
        setRelations([
          ...(rels1 || []).map(r => ({ ...r, direction: 'outgoing', company: r.related })),
          ...(rels2 || []).map(r => ({ ...r, direction: 'incoming', company: r.related })),
        ])
        setLoading(false)
      }
      loadAgain()
    }
    setSaving(false)
    setShowAdd(false)
    setRelatedClientId('')
  }

  const removeRelation = async (relationId: string) => {
    const sb = createClient()
    await sb.from('tt_client_relations').delete().eq('id', relationId)
    setRelations(prev => prev.filter(r => r.id !== relationId))
    addToast({ type: 'success', title: 'Relacion eliminada' })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#9CA3AF] flex items-center gap-2">
          <Link2 size={14} /> Empresas relacionadas
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Agregar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-[#FF6600]" />
        </div>
      ) : relations.length === 0 ? (
        <p className="text-xs text-[#4B5563] text-center py-3">Sin empresas relacionadas</p>
      ) : (
        <div className="space-y-2">
          {relations.map((rel) => {
            const company = rel.company as Row
            const type = rel.relation_type as string
            const color = RELATION_COLORS[type] || '#6B7280'
            const label = RELATION_TYPES.find(t => t.value === type)?.label || type
            return (
              <div
                key={rel.id as string}
                className="flex items-center justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                    <Building2 size={14} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-sm text-[#F0F2F5]">{(company?.name as string) || '—'}</p>
                    <Badge
                      className="mt-0.5"
                      variant="default"
                    >
                      <span style={{ color }}>{label}</span>
                    </Badge>
                  </div>
                </div>
                <button
                  onClick={() => removeRelation(rel.id as string)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#4B5563] hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Relation Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Agregar empresa relacionada" size="md">
        <div className="space-y-4">
          <SearchableSelect
            label="Empresa *"
            value={relatedClientId}
            onChange={(val) => setRelatedClientId(val)}
            onSearch={searchClients}
            minSearchLength={2}
            placeholder="Buscar empresa..."
          />
          <Select
            label="Tipo de relacion"
            options={RELATION_TYPES}
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-[#1E2330]">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={addRelation} loading={saving}>
              <Link2 size={14} /> Vincular
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
