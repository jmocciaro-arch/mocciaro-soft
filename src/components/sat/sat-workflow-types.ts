// =====================================================
// SAT WORKFLOW TYPES — 5-Step Maintenance Flow
// =====================================================

/** Grid de inspección — 8 partes del activo */
export interface InspectionPart {
  name: string
  status: 'OK' | 'NOK' | 'NA'
  notes: string
}

export const DEFAULT_INSPECTION_PARTS: InspectionPart[] = [
  { name: 'Carcasa / Cuerpo exterior', status: 'NA', notes: '' },
  { name: 'Motor / Mecanismo principal', status: 'NA', notes: '' },
  { name: 'Embrague / Clutch', status: 'NA', notes: '' },
  { name: 'Engranajes / Transmisión', status: 'NA', notes: '' },
  { name: 'Gatillo / Selector', status: 'NA', notes: '' },
  { name: 'Conexiones eléctricas / Mangueras', status: 'NA', notes: '' },
  { name: 'Cabezal / Mandril / Cuadrante', status: 'NA', notes: '' },
  { name: 'Accesorios / Reductores', status: 'NA', notes: '' },
]

/** Media item (foto o video) con metadata */
export interface WorkflowPhoto {
  url: string
  caption?: string
  uploaded_at?: string
  uploaded_by?: string | null
  kind?: 'image' | 'video'   // default 'image' para backward compat
  mime_type?: string
  duration_s?: number        // duración en segundos si es video
}

/** Step 1: DIAGNOSTICO */
export interface DiagnosticoData {
  asset_serial: string
  asset_description: string
  client_id: string
  client_name: string
  brand: string
  model: string
  reported_issue: string
  inspection_grid: InspectionPart[]
  initial_notes: string
  photos_in?: WorkflowPhoto[]     // fotos de cómo llegó la herramienta
  // Datos de ingreso (opcionales)
  ingreso_fecha?: string
  ingreso_tecnico?: string
  tipo_servicio?: 'PREVENTIVO' | 'CORRECTIVO'
  aprietes?: number
  condicion_visual?: string
  motivo_ingreso?: string
  // Campos específicos del diagnóstico tipo buscatools-fein
  vida_aprietes_total?: number         // cantidad TOTAL desde nueva
  aprietes_ultimo_service?: number     // aprietes desde el último service
  tornillos_detalle?: string           // cuáles están rotos (texto libre)
  cabezal_vida_util?: string           // "70%", "6 meses", "nuevo" etc
}

/** Item de cotización para repuestos */
export interface CotizacionItem {
  id: string
  description: string
  part_number: string
  quantity: number
  unit_price: number
  currency: 'EUR' | 'USD' | 'ARS'
  subtotal: number
}

/** Step 2: COTIZACION */
export interface CotizacionData {
  items: CotizacionItem[]
  labor_hours: number
  labor_rate: number
  labor_currency: 'EUR' | 'USD' | 'ARS'
  discount_percent: number
  notes: string
  total_parts: number
  total_labor: number
  total: number
}

/** Step 3: REPARACION */
export interface ReparacionData {
  work_performed: string
  post_repair_grid: InspectionPart[]
  start_time: string
  end_time: string
  total_minutes: number
  technician_notes: string
  parts_used: Array<{ description: string; part_number: string; qty: number }>
}

/** Medición de torque individual */
export interface TorqueMeasurement {
  index: number
  value: number | null
}

/** Step 4: TORQUE */
export interface TorqueData {
  target_torque: number
  tolerance_percent: number
  unit: 'Nm' | 'ft-lb' | 'kgf-cm'
  measurements: TorqueMeasurement[]
  // Calculated
  mean: number | null
  std_dev: number | null
  cv: number | null  // Coefficient of Variation
  cp: number | null
  cpk: number | null
  efficiency: number | null
  result: 'CAPAZ' | 'REVISAR' | null
}

/** Step 5: CIERRE */
export interface CierreData {
  final_status: 'reparado' | 'irreparable' | 'garantia' | 'devuelto_sin_reparar'
  warranty_until: string
  delivery_notes: string
  signature_tech: string
  signature_client: string
  saved_to_history: boolean
  photos_out?: WorkflowPhoto[]    // fotos de cómo se fue la herramienta
}

/** Motivos de pausa predefinidos */
export const PAUSE_REASONS = [
  'Esperando repuestos',
  'Esperando aprobación del cliente',
  'Falta de disponibilidad del técnico',
  'Herramienta especial requerida',
  'Información adicional necesaria',
] as const

export type PauseReason = typeof PAUSE_REASONS[number]

/** Estado de pausa */
export interface PauseState {
  is_paused: boolean
  reason: PauseReason | string
  paused_at: string | null
  paused_by: string | null
  free_text: string
  snapshot: Record<string, unknown> | null
}

/** Datos completos del workflow */
export interface SATWorkflowData {
  ticket_id: string
  process_instance_id: string | null
  current_step: number // 0-4
  diagnostico: DiagnosticoData
  cotizacion: CotizacionData
  reparacion: ReparacionData
  torque: TorqueData
  cierre: CierreData
  pause: PauseState
}

/** Colores por paso */
export const STEP_COLORS = [
  { name: 'DIAGNOSTICO', color: '#F97316', bgLight: 'rgba(249,115,22,0.12)', icon: '🔍' },
  { name: 'COTIZACION', color: '#F59E0B', bgLight: 'rgba(245,158,11,0.12)', icon: '💰' },
  { name: 'REPARACION', color: '#14B8A6', bgLight: 'rgba(20,184,166,0.12)', icon: '🔧' },
  { name: 'TORQUE', color: '#10B981', bgLight: 'rgba(16,185,129,0.12)', icon: '⚙️' },
  { name: 'CIERRE', color: '#A855F7', bgLight: 'rgba(168,85,247,0.12)', icon: '✅' },
] as const
