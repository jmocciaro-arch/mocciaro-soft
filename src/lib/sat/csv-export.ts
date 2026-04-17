/**
 * src/lib/sat/csv-export.ts
 *
 * Exportacion CSV para historico de servicios, activos, repuestos.
 * Mismo formato que buscatools-fein para compatibilidad con Excel destino.
 */

// Headers para historial completo de servicios (compatible con hoja HISTORICO de Excel)
export const CSV_HDR_HISTORY = [
  'Referencia', 'N', 'Fecha', 'Tecnico',
  'Carcasa', 'Tornillos', 'Conectores', 'Rodamiento_A', 'Rodamiento_B',
  'Embrague', 'Firmware', 'Reversa', 'Cabezal', 'Rotor', 'Bolillas',
  'MIN_1', 'MIN_2', 'MIN_3', 'MIN_4', 'MIN_5', 'MIN_6', 'MIN_7', 'MIN_8', 'MIN_9', 'MIN_10',
  'MAX_1', 'MAX_2', 'MAX_3', 'MAX_4', 'MAX_5', 'MAX_6', 'MAX_7', 'MAX_8', 'MAX_9', 'MAX_10',
  'TGT_1', 'TGT_2', 'TGT_3', 'TGT_4', 'TGT_5', 'TGT_6', 'TGT_7', 'TGT_8', 'TGT_9', 'TGT_10',
  'Tipo', 'Eficiencia_gral', 'Prox_preventivo', 'Tiempo', 'Estado',
  'Aprietes', 'Cp', 'Cpk', 'Observaciones',
]

/** Escapa un valor para CSV (entre comillas, duplicando comillas internas) */
export function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/** Construye una fila CSV con separador `;` */
export function buildRow(values: unknown[]): string {
  return values.map(escapeCell).join(';')
}

/** Construye CSV completo con BOM (para Excel UTF-8) */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const hdr = headers.map((h) => `"${h}"`).join(';')
  const body = rows.map(buildRow).join('\n')
  return `\uFEFF${hdr}\n${body}`
}

/** Construye una fila de servicio (historico) segun formato CSV_HDR_HISTORY */
export function buildServiceRow(rec: {
  ref: string; n: number; fecha: string; tecnico: string;
  carcasa?: string; tornillos?: string; conectores?: string;
  embrague?: string; firmware?: string; reversa?: string;
  cabezal?: string; rotor?: string; bolillas?: string;
  min: Array<number | null>; max: Array<number | null>; tgt: Array<number | null>;
  tipo?: string; ef_gral?: number | null; prox_prev?: number | null; tiempo?: number | null;
  estado?: string; aprietes?: number | null; cp?: number | null; cpk?: number | null;
  obs?: string;
}): string {
  const values = [
    rec.ref, rec.n, rec.fecha, rec.tecnico,
    rec.carcasa || '', rec.tornillos || '', rec.conectores || '', '', '',
    rec.embrague || '', rec.firmware || '', rec.reversa || '', rec.cabezal || '', rec.rotor || '', rec.bolillas || '',
    ...rec.min, ...rec.max, ...rec.tgt,
    rec.tipo || '', rec.ef_gral ?? '', rec.prox_prev ?? '', rec.tiempo ?? '', rec.estado || '',
    rec.aprietes ?? '', rec.cp ?? '', rec.cpk ?? '', rec.obs || '',
  ]
  return buildRow(values)
}

/** Dispara descarga de un CSV desde el navegador */
export function downloadCsv(content: string, filename: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
