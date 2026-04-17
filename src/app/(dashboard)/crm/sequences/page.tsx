'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { SequenceBuilder } from '@/components/crm/sequence-builder'
import { Plus, Mail, Play, Pause, Trash2, Users, ChevronRight } from 'lucide-react'

interface SequenceStep {
  delay_hours: number
  subject: string
  body_template: string
  channel: 'email' | 'whatsapp'
}

interface Sequence {
  id: string
  company_id: string
  name: string
  trigger_type: string
  steps: SequenceStep[]
  is_active: boolean
  created_at: string
  enrollments_count?: number
}

const TRIGGER_LABELS: Record<string, string> = {
  lead_new: 'Lead nuevo',
  lead_qualified: 'Lead calificado',
  quote_sent: 'Cotización enviada',
  quote_accepted: 'Cotización aceptada',
  order_created: 'Pedido creado',
  invoice_sent: 'Factura enviada',
  manual: 'Manual',
}

export default function SequencesPage() {
  const supabase = createClient()
  const { visibleCompanies } = useCompanyContext()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [editSequence, setEditSequence] = useState<Sequence | null>(null)
  const [enrollmentsOpen, setEnrollmentsOpen] = useState<string | null>(null)
  const [enrollments, setEnrollments] = useState<Record<string, number>>({})

  // Form nuevo
  const [newName, setNewName] = useState('')
  const [newTrigger, setNewTrigger] = useState<string>('manual')
  const [newSteps, setNewSteps] = useState<SequenceStep[]>([])
  const [saving, setSaving] = useState(false)

  const companyIds = visibleCompanies.map((c) => c.id)

  const load = useCallback(async () => {
    if (companyIds.length === 0) return
    setLoading(true)
    const { data } = await supabase
      .from('tt_email_sequences')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
    setSequences((data as Sequence[]) ?? [])

    // Contar enrollments por secuencia
    const ids = (data as Sequence[])?.map((s) => s.id) ?? []
    if (ids.length > 0) {
      const { data: counts } = await supabase
        .from('tt_email_enrollments')
        .select('sequence_id')
        .in('sequence_id', ids)
        .eq('status', 'active')
      const map: Record<string, number> = {}
      counts?.forEach((r: { sequence_id: string }) => {
        map[r.sequence_id] = (map[r.sequence_id] ?? 0) + 1
      })
      setEnrollments(map)
    }
    setLoading(false)
  }, [companyIds, supabase])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate() {
    if (!newName.trim() || companyIds.length === 0) return
    setSaving(true)
    const companyId = companyIds[0]
    const { error } = await supabase.from('tt_email_sequences').insert({
      company_id: companyId,
      name: newName.trim(),
      trigger_type: newTrigger,
      steps: newSteps,
      is_active: true,
    })
    if (!error) {
      setNewOpen(false)
      setNewName('')
      setNewTrigger('manual')
      setNewSteps([])
      await load()
    }
    setSaving(false)
  }

  async function handleToggle(seq: Sequence) {
    await supabase
      .from('tt_email_sequences')
      .update({ is_active: !seq.is_active })
      .eq('id', seq.id)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminás esta secuencia? Se van a borrar todos los enrollments.')) return
    await supabase.from('tt_email_sequences').delete().eq('id', id)
    await load()
  }

  async function handleSaveEdit() {
    if (!editSequence) return
    setSaving(true)
    await supabase
      .from('tt_email_sequences')
      .update({
        name: editSequence.name,
        trigger_type: editSequence.trigger_type,
        steps: editSequence.steps,
      })
      .eq('id', editSequence.id)
    setEditSequence(null)
    await load()
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Secuencias de Email</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Automatizá campañas de emails para leads y clientes
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={16} />
          Nueva secuencia
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Mail size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#F0F2F5]">{sequences.length}</p>
                <p className="text-xs text-[#6B7280]">Secuencias totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Play size={20} className="text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#F0F2F5]">
                  {sequences.filter((s) => s.is_active).length}
                </p>
                <p className="text-xs text-[#6B7280]">Activas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#F0F2F5]">
                  {Object.values(enrollments).reduce((a, b) => a + b, 0)}
                </p>
                <p className="text-xs text-[#6B7280]">Enrolados activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de secuencias */}
      {loading ? (
        <Card>
          <CardContent className="pt-5">
            <div className="text-center text-[#6B7280] py-8">Cargando secuencias...</div>
          </CardContent>
        </Card>
      ) : sequences.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="text-center py-12">
              <Mail size={40} className="text-[#2A3040] mx-auto mb-3" />
              <p className="text-[#6B7280]">No tenés secuencias configuradas</p>
              <Button className="mt-4" onClick={() => setNewOpen(true)}>
                <Plus size={16} /> Crear primera secuencia
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <Card key={seq.id} hover>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-[#F0F2F5] truncate">{seq.name}</h3>
                    <Badge variant={seq.is_active ? 'success' : 'default'}>
                      {seq.is_active ? 'Activa' : 'Pausada'}
                    </Badge>
                    <Badge variant="info">{TRIGGER_LABELS[seq.trigger_type] ?? seq.trigger_type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-[#6B7280]">
                    <span>{seq.steps.length} pasos</span>
                    <span>{enrollments[seq.id] ?? 0} enrolados activos</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnrollmentsOpen(seq.id)}
                    title="Ver enrolados"
                  >
                    <Users size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditSequence({ ...seq })}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(seq)}
                    title={seq.is_active ? 'Pausar' : 'Activar'}
                  >
                    {seq.is_active ? <Pause size={14} /> : <Play size={14} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(seq.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              {/* Steps preview */}
              {seq.steps.length > 0 && (
                <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
                  {seq.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-1 shrink-0">
                      <div className="px-2 py-1 rounded bg-[#1E2330] text-[10px] text-[#9CA3AF] border border-[#2A3040] whitespace-nowrap">
                        {step.delay_hours === 0 ? 'Inmediato' : `+${step.delay_hours}h`}: {step.subject.slice(0, 25)}...
                      </div>
                      {i < seq.steps.length - 1 && <ChevronRight size={12} className="text-[#2A3040]" />}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal nueva secuencia */}
      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Nueva secuencia" size="xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#9CA3AF] mb-1">Nombre</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Onboarding nuevos leads"
            />
          </div>
          <div>
            <label className="block text-sm text-[#9CA3AF] mb-1">Disparador</label>
            <select
              value={newTrigger}
              onChange={(e) => setNewTrigger(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-[#1E2330] border border-[#2A3040] text-[#F0F2F5] text-sm focus:outline-none focus:border-orange-500"
            >
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-[#9CA3AF] mb-2">Pasos</label>
            <SequenceBuilder steps={newSteps} onChange={setNewSteps} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!newName.trim()}>
              Crear secuencia
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar secuencia */}
      <Modal
        isOpen={!!editSequence}
        onClose={() => setEditSequence(null)}
        title={`Editar: ${editSequence?.name}`}
        size="xl"
      >
        {editSequence && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-1">Nombre</label>
              <Input
                value={editSequence.name}
                onChange={(e) => setEditSequence({ ...editSequence, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-1">Disparador</label>
              <select
                value={editSequence.trigger_type}
                onChange={(e) => setEditSequence({ ...editSequence, trigger_type: e.target.value })}
                className="w-full h-10 px-3 rounded-lg bg-[#1E2330] border border-[#2A3040] text-[#F0F2F5] text-sm focus:outline-none focus:border-orange-500"
              >
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-2">Pasos</label>
              <SequenceBuilder
                steps={editSequence.steps}
                onChange={(steps) => setEditSequence({ ...editSequence, steps })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditSequence(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} loading={saving}>Guardar cambios</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal enrollments */}
      <Modal
        isOpen={!!enrollmentsOpen}
        onClose={() => setEnrollmentsOpen(null)}
        title="Enrolados en esta secuencia"
        size="lg"
      >
        {enrollmentsOpen && (
          <EnrollmentsList sequenceId={enrollmentsOpen} />
        )}
      </Modal>
    </div>
  )
}

function EnrollmentsList({ sequenceId }: { sequenceId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<{ id: string; email: string; current_step: number; status: string; last_sent_at: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tt_email_enrollments')
      .select('id, email, current_step, status, last_sent_at')
      .eq('sequence_id', sequenceId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems(data ?? [])
        setLoading(false)
      })
  }, [sequenceId, supabase])

  if (loading) return <div className="text-center text-[#6B7280] py-6">Cargando...</div>
  if (items.length === 0) return <div className="text-center text-[#6B7280] py-6">No hay enrolados</div>

  const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
    active: 'success',
    paused: 'warning',
    completed: 'info',
    unsubscribed: 'default',
    failed: 'danger',
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-[#1E2330]">
          <div>
            <p className="text-sm text-[#F0F2F5]">{item.email}</p>
            <p className="text-xs text-[#6B7280]">Paso {item.current_step}</p>
          </div>
          <Badge variant={STATUS_BADGE[item.status] ?? 'default'}>{item.status}</Badge>
        </div>
      ))}
    </div>
  )
}
