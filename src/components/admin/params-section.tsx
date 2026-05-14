'use client'

/**
 * ParamsSection — UI mejorada para la tab "Parametros" del admin.
 *
 * Los parámetros se cargan desde `tt_system_params` (key/value/description).
 * Acá los AGRUPAMOS por categoría con labels amigables, unidades y descripciones,
 * de modo que el usuario no tenga que entender los snake_case técnicos.
 *
 * - Los params "conocidos" se ubican en su grupo y se renderizan con su widget
 *   apropiado (number, currency, percent, day-count, etc.).
 * - Los params "sensibles/sistema" (OAuth tokens, JSON de layouts) viven bajo
 *   "Avanzado", colapsado por defecto, con warning.
 * - Cualquier otro param no listado cae en "Otros".
 *
 * Guardar: el botón aparece cuando hay cambios sin guardar y muestra el count.
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, Save, Loader2, AlertTriangle, Info, DollarSign, Calendar, Percent, Mail, Layout } from 'lucide-react'

type Param = Record<string, unknown>

interface Props {
  loading: boolean
  params: Param[]
  paramEdits: Record<string, string>
  setParamEdits: (v: Record<string, string>) => void
  onSave: () => void | Promise<void>
}

type ParamDef = {
  key: string
  label: string
  help?: string
  prefix?: string
  suffix?: string
  type?: 'number' | 'text'
  placeholder?: string
}

type Group = {
  id: string
  title: string
  description?: string
  icon: typeof DollarSign
  items: ParamDef[]
  advanced?: boolean
}

const GROUPS: Group[] = [
  {
    id: 'currencies',
    title: 'Tipos de cambio',
    description: 'Cotizaciones usadas para conversión entre EUR, USD y ARS.',
    icon: DollarSign,
    items: [
      { key: 'eur_to_ars', label: 'EUR → ARS', help: 'Cuántos pesos argentinos vale 1 euro', suffix: 'ARS', type: 'number', placeholder: 'Ej: 1780' },
      { key: 'usd_to_ars', label: 'USD → ARS', help: 'Cuántos pesos argentinos vale 1 dólar', suffix: 'ARS', type: 'number', placeholder: 'Ej: 1450' },
      { key: 'eur_to_usd', label: 'EUR → USD', help: 'Cuántos dólares vale 1 euro', suffix: 'USD', type: 'number', placeholder: 'Ej: 1.19' },
    ],
  },
  {
    id: 'sales',
    title: 'Cotizador y ventas',
    description: 'Defaults aplicados al crear cotizaciones nuevas.',
    icon: Percent,
    items: [
      { key: 'default_margin', label: 'Margen default', help: 'Porcentaje de margen aplicado por defecto al cotizar', suffix: '%', type: 'number', placeholder: 'Ej: 30' },
      { key: 'quote_validity_days', label: 'Validez de cotización', help: 'Días que la cotización es válida desde su emisión', suffix: 'días', type: 'number', placeholder: 'Ej: 30' },
    ],
  },
  {
    id: 'integrations',
    title: 'Integraciones',
    description: 'Tokens y conexiones con servicios externos. No edites manualmente.',
    icon: Mail,
    advanced: true,
    items: [
      { key: 'gmail_tokens', label: 'Gmail OAuth tokens', help: 'Tokens de acceso a Gmail. Reconectá desde el panel de Gmail si caducaron.' },
    ],
  },
  {
    id: 'system',
    title: 'Sistema',
    description: 'Configuración interna. Cambiar solo si sabés qué estás haciendo.',
    icon: Layout,
    advanced: true,
    items: [
      { key: 'dashboard_layout_default_user', label: 'Layout default del dashboard', help: 'JSON con las posiciones default de los widgets del dashboard para usuarios nuevos.' },
    ],
  },
]

export function ParamsSection({ loading, params, paramEdits, setParamEdits, onSave }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)

  // Map key → DB row para acceso rápido
  const paramsByKey = useMemo(() => {
    const map: Record<string, Param> = {}
    for (const p of params) map[p.key as string] = p
    return map
  }, [params])

  // Keys que están definidas en algún grupo
  const knownKeys = useMemo(
    () => new Set(GROUPS.flatMap(g => g.items.map(i => i.key))),
    []
  )

  // Params no listados → "Otros"
  const otherParams = useMemo(
    () => params.filter(p => !knownKeys.has(p.key as string)),
    [params, knownKeys]
  )

  // Contador de cambios sin guardar
  const unsavedCount = useMemo(() => {
    let count = 0
    for (const p of params) {
      const k = p.key as string
      const original = (p.value as string) || ''
      const current = paramEdits[k] ?? ''
      if (original !== current) count++
    }
    return count
  }, [params, paramEdits])

  const handleSave = async () => {
    setSaving(true)
    try { await onSave() } finally { setSaving(false) }
  }

  const updateValue = (key: string, value: string) => {
    setParamEdits({ ...paramEdits, [key]: value })
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-[#FF6600]" size={28} />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (params.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-[#6B7280] text-center py-16">No hay parámetros configurados</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-[13px] text-[#1E40AF]">
        <Info size={16} className="shrink-0 mt-0.5" />
        <div>
          <strong>Parámetros del sistema.</strong> Estos valores se aplican globalmente al crear documentos, conversiones de moneda y comportamiento del soft. Los cambios se guardan al hacer click en <em>Guardar cambios</em>.
        </div>
      </div>

      {/* Grupos no-avanzados */}
      {GROUPS.filter(g => !g.advanced).map(group => (
        <ParamGroupCard
          key={group.id}
          group={group}
          paramsByKey={paramsByKey}
          paramEdits={paramEdits}
          updateValue={updateValue}
        />
      ))}

      {/* Otros params no clasificados */}
      {otherParams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Otros parámetros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {otherParams.map(p => (
                <Input
                  key={p.key as string}
                  label={(p.key as string) || ''}
                  value={paramEdits[p.key as string] || ''}
                  onChange={(e) => updateValue(p.key as string, e.target.value)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Avanzado (colapsable) */}
      <Card>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#F8F8F8] transition-colors rounded-lg"
        >
          <div className="flex items-center gap-2.5">
            {showAdvanced ? <ChevronDown size={16} className="text-[#6B7280]" /> : <ChevronRight size={16} className="text-[#6B7280]" />}
            <span className="font-bold text-[#1F2937]">Avanzado</span>
            <span className="text-xs text-[#9CA3AF]">— integraciones, sistema, tokens</span>
          </div>
          <AlertTriangle size={14} className="text-[#F59E0B]" />
        </button>
        {showAdvanced && (
          <CardContent>
            <div className="flex items-start gap-3 px-4 py-3 rounded-md bg-[#FFF7ED] border border-[#FED7AA] text-[13px] text-[#9A3412] mb-4">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>Zona avanzada.</strong> Estos parámetros contienen tokens de autenticación, JSON de configuración y otros valores que normalmente NO requieren edición manual. Modificarlos sin saber puede romper integraciones o el comportamiento del soft.
              </div>
            </div>
            <div className="space-y-4">
              {GROUPS.filter(g => g.advanced).map(group => (
                <ParamGroupCard
                  key={group.id}
                  group={group}
                  paramsByKey={paramsByKey}
                  paramEdits={paramEdits}
                  updateValue={updateValue}
                  embedded
                />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Sticky save button */}
      <div className="sticky bottom-4 flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-white border border-[#E5E5E5] shadow-md">
        <span className="text-[13px] text-[#6B7280]">
          {unsavedCount === 0
            ? 'Sin cambios sin guardar'
            : `${unsavedCount} ${unsavedCount === 1 ? 'cambio' : 'cambios'} sin guardar`}
        </span>
        <Button onClick={handleSave} loading={saving} disabled={unsavedCount === 0}>
          <Save size={14} /> Guardar cambios
        </Button>
      </div>
    </div>
  )
}

function ParamGroupCard({
  group, paramsByKey, paramEdits, updateValue, embedded,
}: {
  group: Group
  paramsByKey: Record<string, Param>
  paramEdits: Record<string, string>
  updateValue: (key: string, value: string) => void
  embedded?: boolean
}) {
  const Icon = group.icon
  // Solo mostramos items que existen en la DB
  const visibleItems = group.items.filter(def => paramsByKey[def.key])
  if (visibleItems.length === 0) return null

  const Inner = (
    <div className="space-y-4">
      {!embedded && group.description && (
        <p className="text-[13px] text-[#6B7280] -mt-2 mb-2">{group.description}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {visibleItems.map(def => (
          <ParamField
            key={def.key}
            def={def}
            value={paramEdits[def.key] ?? ''}
            onChange={(v) => updateValue(def.key, v)}
          />
        ))}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="border border-[#E5E5E5] rounded-md p-4 bg-[#FAFAFA]">
        <div className="flex items-center gap-2 mb-3">
          <Icon size={15} className="text-[#FF6600]" />
          <span className="font-semibold text-[#1F2937] text-sm">{group.title}</span>
        </div>
        {group.description && (
          <p className="text-[12px] text-[#6B7280] mb-3">{group.description}</p>
        )}
        {Inner}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-[#FFF5EE] flex items-center justify-center">
            <Icon size={16} className="text-[#FF6600]" />
          </div>
          <CardTitle>{group.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{Inner}</CardContent>
    </Card>
  )
}

function ParamField({
  def, value, onChange,
}: {
  def: ParamDef
  value: string
  onChange: (v: string) => void
}) {
  const isLongValue = value && value.length > 80

  return (
    <div className="space-y-1">
      <label className="block text-[13px] font-semibold text-[#374151]">
        {def.label}
      </label>
      {isLongValue ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] font-mono text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#FF6600]/30 focus:border-[#FF6600]"
        />
      ) : (
        <div className="relative">
          {def.prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[13px] pointer-events-none">
              {def.prefix}
            </span>
          )}
          <input
            type={def.type === 'number' ? 'number' : 'text'}
            inputMode={def.type === 'number' ? 'decimal' : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={def.placeholder}
            className={`w-full h-9 rounded-md bg-white border border-[#E5E5E5] text-[13px] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FF6600]/30 focus:border-[#FF6600] transition-colors ${
              def.prefix ? 'pl-7' : 'pl-3'
            } ${def.suffix ? 'pr-14' : 'pr-3'}`}
          />
          {def.suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[12px] font-medium pointer-events-none">
              {def.suffix}
            </span>
          )}
        </div>
      )}
      {def.help && (
        <p className="text-[11px] text-[#9CA3AF] leading-tight">{def.help}</p>
      )}
    </div>
  )
}
