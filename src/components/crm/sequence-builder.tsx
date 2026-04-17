'use client'

import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface SequenceStep {
  delay_hours: number
  subject: string
  body_template: string
  channel: 'email' | 'whatsapp'
}

interface SequenceBuilderProps {
  steps: SequenceStep[]
  onChange: (steps: SequenceStep[]) => void
}

const TEMPLATE_VARIABLES = [
  '{{client_name}}',
  '{{company_name}}',
  '{{document_url}}',
  '{{lead_email}}',
  '{{lead_company}}',
]

const DELAY_PRESETS = [
  { label: 'Inmediato', hours: 0 },
  { label: '1 hora', hours: 1 },
  { label: '24 horas', hours: 24 },
  { label: '48 horas', hours: 48 },
  { label: '3 días', hours: 72 },
  { label: '1 semana', hours: 168 },
]

function StepCard({
  step,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: SequenceStep
  index: number
  total: number
  onUpdate: (s: SequenceStep) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="border border-[#2A3040] rounded-xl bg-[#0F1218] overflow-hidden">
      {/* Header del paso */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1E2330] border-b border-[#2A3040]">
        <GripVertical size={14} className="text-[#4B5563] shrink-0" />
        <span className="text-xs font-semibold text-[#9CA3AF]">Paso {index + 1}</span>

        {/* Delay */}
        <div className="ml-2 flex items-center gap-1.5">
          <span className="text-xs text-[#6B7280]">Demora:</span>
          <select
            value={DELAY_PRESETS.find((p) => p.hours === step.delay_hours)?.hours ?? 'custom'}
            onChange={(e) => {
              const hours = Number(e.target.value)
              onUpdate({ ...step, delay_hours: isNaN(hours) ? step.delay_hours : hours })
            }}
            className="h-7 px-2 text-xs rounded-lg bg-[#0F1218] border border-[#2A3040] text-[#F0F2F5] focus:outline-none"
          >
            {DELAY_PRESETS.map((p) => (
              <option key={p.hours} value={p.hours}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Canal */}
        <div className="ml-2 flex items-center gap-1.5">
          <span className="text-xs text-[#6B7280]">Canal:</span>
          <select
            value={step.channel}
            onChange={(e) => onUpdate({ ...step, channel: e.target.value as 'email' | 'whatsapp' })}
            className="h-7 px-2 text-xs rounded-lg bg-[#0F1218] border border-[#2A3040] text-[#F0F2F5] focus:outline-none"
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>

        {/* Controles */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-[#4B5563] hover:text-[#9CA3AF] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded text-[#4B5563] hover:text-[#9CA3AF] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded text-[#4B5563] hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Contenido del paso */}
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-[#9CA3AF] mb-1">Asunto</label>
          <Input
            value={step.subject}
            onChange={(e) => onUpdate({ ...step, subject: e.target.value })}
            placeholder="Ej: Seguimiento de tu consulta, {{client_name}}"
          />
        </div>
        <div>
          <label className="block text-xs text-[#9CA3AF] mb-1">Cuerpo del mensaje</label>
          <textarea
            value={step.body_template}
            onChange={(e) => onUpdate({ ...step, body_template: e.target.value })}
            rows={5}
            placeholder={`Hola {{client_name}},\n\nQuería ponerme en contacto con vos...`}
            className="w-full px-3 py-2 rounded-lg bg-[#1E2330] border border-[#2A3040] text-[#F0F2F5] text-sm focus:outline-none focus:border-orange-500 resize-y font-mono"
          />
        </div>

        {/* Variables disponibles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#6B7280]">Variables:</span>
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onUpdate({ ...step, body_template: step.body_template + v })}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2330] text-orange-400 border border-[#2A3040] hover:border-orange-500/50 transition-colors font-mono"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SequenceBuilder({ steps, onChange }: SequenceBuilderProps) {
  function addStep() {
    const lastDelay = steps[steps.length - 1]?.delay_hours ?? 0
    onChange([
      ...steps,
      {
        delay_hours: lastDelay === 0 ? 24 : lastDelay + 24,
        subject: '',
        body_template: '',
        channel: 'email',
      },
    ])
  }

  function updateStep(index: number, step: SequenceStep) {
    onChange(steps.map((s, i) => (i === index ? step : s)))
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index))
  }

  function moveStep(from: number, to: number) {
    const copy = [...steps]
    const [item] = copy.splice(from, 1)
    copy.splice(to, 0, item)
    onChange(copy)
  }

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <div className="text-center py-8 text-[#6B7280] text-sm border border-dashed border-[#2A3040] rounded-xl">
          No hay pasos. Agregá el primero.
        </div>
      )}

      {steps.map((step, i) => (
        <StepCard
          key={i}
          step={step}
          index={i}
          total={steps.length}
          onUpdate={(s) => updateStep(i, s)}
          onRemove={() => removeStep(i)}
          onMoveUp={() => moveStep(i, i - 1)}
          onMoveDown={() => moveStep(i, i + 1)}
        />
      ))}

      <Button variant="secondary" onClick={addStep} className="w-full">
        <Plus size={16} /> Agregar paso
      </Button>
    </div>
  )
}
