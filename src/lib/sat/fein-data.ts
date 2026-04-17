/**
 * src/lib/sat/fein-data.ts
 *
 * Constantes compartidas del modulo SAT FEIN.
 * Port del buscatools-fein original.
 */

// 9 partes inspeccionables (diagnostico y post-reparacion) — formato buscatools-fein numerado
export const PARTS = [
  'firmware',
  'tornillos',
  'embrague',
  'carcasa',
  'reversa',
  'cabezal',
  'rotor',
  'bolillas',
  'conectores',   // opcional / legacy
] as const

export type PartKey = typeof PARTS[number]

export const PART_LBL: Record<PartKey, string> = {
  firmware: 'Firmware',
  tornillos: 'Tornillos',
  embrague: 'Embrague',
  carcasa: 'Carcasa',
  reversa: 'Reversa',
  cabezal: 'Cabezal',
  rotor: 'Rotor',
  bolillas: 'Bolillas',
  conectores: 'Conectores',
}

// Tipos de items de cotizacion
export const TIPOS_COT = [
  'MANO DE OBRA',
  'REPUESTO',
  'INSUMO',
  'CALIBRACION',
  'OTRO',
] as const

export type TipoCot = typeof TIPOS_COT[number]

// Motivos de pausa (mismo set que en buscatools-fein original)
export const PAUSE_REASONS_FULL = [
  { key: 'sin_repuesto',   label: 'Repuesto no disponible fisicamente', icon: '🔩' },
  { key: 'rep_falla',      label: 'Repuesto con falla / defectuoso',    icon: '⚠️' },
  { key: 'urgencia',       label: 'Urgencia / otra prioridad',          icon: '🚨' },
  { key: 'espera_cliente', label: 'Esperando aprobacion del cliente',   icon: '⏳' },
  { key: 'otro',           label: 'Otro motivo',                        icon: '📝' },
] as const

export type PauseReasonKey = typeof PAUSE_REASONS_FULL[number]['key']

// Modelos FEIN (9)
export const MODELOS_FEIN = [
  'ASM18-3',
  'ASM18-8',
  'ASM18-12',
  'ASW18-6',
  'ASW18-12',
  'ASW18-18',
  'ASW18-30',
  'ASW18-45',
  'ASW18-60',
] as const

export type ModeloFein = typeof MODELOS_FEIN[number]

// Monedas soportadas en cotizacion
export const CURRENCIES = ['USD', 'EUR', 'ARS'] as const
export type Currency = typeof CURRENCIES[number]

// Simbolos
export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: 'USD $',
  EUR: '€',
  ARS: 'ARS $',
}

// Colores por step del workflow
export const STEP_COLORS = [
  { name: 'DIAGNOSTICO', color: '#F97316', cssClass: 'sn-o', icon: '🔍' },
  { name: 'COTIZACION',  color: '#F59E0B', cssClass: 'sn-a', icon: '💰' },
  { name: 'REPARACION',  color: '#14B8A6', cssClass: 'sn-t', icon: '🔧' },
  { name: 'TORQUE',      color: '#10B981', cssClass: 'sn-g', icon: '⚙️' },
  { name: 'CIERRE',      color: '#8B5CF6', cssClass: 'sn-p', icon: '✅' },
] as const

// Estados de cotizacion
export const COT_STATUS = ['PENDIENTE', 'ENVIADA', 'APROBADA', 'RECHAZADA'] as const
export type CotStatus = typeof COT_STATUS[number]

// Estados de lote
export const LOTE_STATUS = ['pendiente', 'enviada', 'aprobada', 'rechazada'] as const
export type LoteStatus = typeof LOTE_STATUS[number]

// Tipos de servicio
export const TIPOS_SERVICIO = ['PREVENTIVO', 'CORRECTIVO'] as const
export type TipoServicio = typeof TIPOS_SERVICIO[number]

// Estados finales
export const ESTADOS_FINALES = ['APROBADA', 'REPROBADA', 'EN REVISION'] as const
export type EstadoFinal = typeof ESTADOS_FINALES[number]

// Normaliza nombre de modelo para matching (quita espacios, -PC, uppercase)
export function normalizeModel(model: string | null | undefined): string {
  return (model || '').replace(/\s+/g, '').replace(/-PC$/i, '').toUpperCase()
}

// Normaliza nombre de cliente (lowercase, sin tildes, sin puntuacion)
export function normalizeClientName(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}
