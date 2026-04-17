'use client'

import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { CheckCircle, FileText, Wrench, Gauge, Camera } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { MediaCapture } from '@/components/sat/media-capture'
import type { CierreData, DiagnosticoData, CotizacionData, ReparacionData, TorqueData, WorkflowPhoto } from '../sat-workflow-types'

interface StepCierreProps {
  data: CierreData
  onChange: (data: CierreData) => void
  readOnly?: boolean
  ticketId?: string
  // Summary data from previous steps
  diagnostico: DiagnosticoData
  cotizacion: CotizacionData
  reparacion: ReparacionData
  torque: TorqueData
}

const FINAL_STATUSES = [
  { value: 'reparado', label: 'Reparado' },
  { value: 'irreparable', label: 'Irreparable' },
  { value: 'garantia', label: 'En garantia' },
  { value: 'devuelto_sin_reparar', label: 'Devuelto sin reparar' },
]

export function StepCierre({ data, onChange, readOnly, ticketId, diagnostico, cotizacion, reparacion, torque }: StepCierreProps) {
  const update = (partial: Partial<CierreData>) => {
    onChange({ ...data, ...partial })
  }

  const formatTime = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}min` : `${m}min`
  }

  const nokDiag = diagnostico.inspection_grid.filter(p => p.status === 'NOK').length
  const okPost = reparacion.post_repair_grid.filter(p => p.status === 'OK').length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<FileText size={18} />}
          color="#F97316"
          title="Diagnostico"
          lines={[
            `Equipo: ${diagnostico.brand} ${diagnostico.model}`,
            `Serie: ${diagnostico.asset_serial}`,
            `NOK encontrados: ${nokDiag}`,
          ]}
        />
        <SummaryCard
          icon={<span className="text-lg">💰</span>}
          color="#F59E0B"
          title="Cotizacion"
          lines={[
            `Repuestos: ${formatCurrency(cotizacion.total_parts, 'EUR')}`,
            `MO: ${cotizacion.labor_hours}h`,
            `Total: ${formatCurrency(cotizacion.total, 'EUR')}`,
          ]}
        />
        <SummaryCard
          icon={<Wrench size={18} />}
          color="#14B8A6"
          title="Reparacion"
          lines={[
            `Tiempo: ${reparacion.total_minutes > 0 ? formatTime(reparacion.total_minutes) : '—'}`,
            `Post-repair OK: ${okPost}/${reparacion.post_repair_grid.length}`,
            `Repuestos usados: ${reparacion.parts_used.length}`,
          ]}
        />
        <SummaryCard
          icon={<Gauge size={18} />}
          color="#10B981"
          title="Torque"
          lines={[
            `Objetivo: ${torque.target_torque} ${torque.unit}`,
            `Media: ${torque.mean ?? '—'} ${torque.unit}`,
            `Cpk: ${torque.cpk ?? '—'} → ${torque.result ?? '—'}`,
          ]}
        />
      </div>

      {/* Torque Result Badge */}
      {torque.result && (
        <div className="flex justify-center">
          <div className={`px-6 py-3 rounded-xl border-2 ${
            torque.result === 'CAPAZ'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <span className={`text-lg font-bold ${torque.result === 'CAPAZ' ? 'text-emerald-400' : 'text-red-400'}`}>
              {torque.result === 'CAPAZ' ? '✅ EQUIPO CAPAZ' : '⚠️ EQUIPO A REVISAR'}
            </span>
          </div>
        </div>
      )}

      {/* Final Status */}
      <Card>
        <h3 className="text-sm font-semibold text-[#A855F7] mb-4 flex items-center gap-2">
          <CheckCircle size={16} /> Estado final y cierre
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Estado final *"
            options={FINAL_STATUSES}
            value={data.final_status}
            onChange={(e) => update({ final_status: e.target.value as CierreData['final_status'] })}
            disabled={readOnly}
          />
          <Input
            label="Garantia hasta"
            type="date"
            value={data.warranty_until}
            onChange={(e) => update({ warranty_until: e.target.value })}
            readOnly={readOnly}
          />
        </div>
      </Card>

      {/* Delivery Notes */}
      <Card>
        <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Notas de entrega</label>
        <textarea
          value={data.delivery_notes}
          onChange={(e) => update({ delivery_notes: e.target.value })}
          className="w-full h-24 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
          placeholder="Instrucciones de entrega, recomendaciones al cliente..."
          readOnly={readOnly}
        />
      </Card>

      {/* Fotos y videos de egreso */}
      <Card>
        <h3 className="text-sm font-semibold text-[#A855F7] mb-2 flex items-center gap-2">
          <Camera size={16} /> Fotos y videos de egreso
        </h3>
        <p className="text-xs text-[#6B7280] mb-3">
          Registrá cómo se va la herramienta: fotos del estado final y video del funcionamiento post-reparación. Queda como prueba para el cliente.
        </p>
        <MediaCapture
          media={(data.photos_out || []) as WorkflowPhoto[]}
          onChange={(media) => update({ photos_out: media })}
          pathPrefix={`tickets/${ticketId || 'draft'}/out`}
          maxItems={15}
          disabled={readOnly}
        />
      </Card>

      {/* Signatures */}
      <Card>
        <h3 className="text-sm font-semibold text-[#A855F7] mb-4">Firmas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre tecnico"
            value={data.signature_tech}
            onChange={(e) => update({ signature_tech: e.target.value })}
            placeholder="Nombre completo del tecnico"
            readOnly={readOnly}
          />
          <Input
            label="Nombre cliente"
            value={data.signature_client}
            onChange={(e) => update({ signature_client: e.target.value })}
            placeholder="Nombre completo del cliente"
            readOnly={readOnly}
          />
        </div>
      </Card>
    </div>
  )
}

function SummaryCard({ icon, color, title, lines }: { icon: React.ReactNode; color: string; title: string; lines: string[] }) {
  return (
    <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <h4 className="text-xs font-semibold" style={{ color }}>{title}</h4>
      </div>
      <div className="space-y-1">
        {lines.map((line, i) => (
          <p key={i} className="text-xs text-[#9CA3AF]">{line}</p>
        ))}
      </div>
    </div>
  )
}
