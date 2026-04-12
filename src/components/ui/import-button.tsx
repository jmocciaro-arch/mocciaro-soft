'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Loader2, X, ArrowRight, RefreshCw, FileSpreadsheet } from 'lucide-react'
import { parseCSV, readFileAsText, parseXLSX, isXLSXFile } from '@/lib/csv-parser'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/use-permissions'
import { useToast } from '@/components/ui/toast'
import {
  detectStelOrderFormat,
  UPSERT_KEYS,
  expandDotNotation,
  type StelOrderDetection,
} from '@/lib/stelorder-mappings'

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface ImportField {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'number' | 'date' | 'boolean'
}

export interface ImportResults {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

interface ImportButtonProps {
  targetTable: string
  fields: ImportField[]
  onComplete?: (results: ImportResults) => void
  permission?: string
  label?: string
  className?: string
}

type MappingState = Record<number, string> // csv column index -> field key

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function autoDetectMapping(csvHeaders: string[], fields: ImportField[]): MappingState {
  const mapping: MappingState = {}

  csvHeaders.forEach((header, idx) => {
    const normalizedHeader = normalizeStr(header)

    // Intento 1: match exacto por key
    const exactKey = fields.find(f => normalizeStr(f.key) === normalizedHeader)
    if (exactKey) { mapping[idx] = exactKey.key; return }

    // Intento 2: match exacto por label
    const exactLabel = fields.find(f => normalizeStr(f.label) === normalizedHeader)
    if (exactLabel) { mapping[idx] = exactLabel.key; return }

    // Intento 3: match parcial (el header contiene el key o viceversa)
    const partial = fields.find(f =>
      normalizedHeader.includes(normalizeStr(f.key)) ||
      normalizeStr(f.key).includes(normalizedHeader) ||
      normalizedHeader.includes(normalizeStr(f.label)) ||
      normalizeStr(f.label).includes(normalizedHeader)
    )
    if (partial) {
      // Solo si no fue ya mapeado
      const alreadyMapped = Object.values(mapping).includes(partial.key)
      if (!alreadyMapped) mapping[idx] = partial.key
    }
  })

  return mapping
}

function validateValue(value: string, field: ImportField): { valid: boolean; parsed: unknown } {
  if (!value && field.required) return { valid: false, parsed: null }
  if (!value) return { valid: true, parsed: null }

  switch (field.type) {
    case 'number': {
      // Aceptar formatos con coma decimal
      const cleaned = value.replace(/\s/g, '').replace(',', '.')
      const num = Number(cleaned)
      if (isNaN(num)) return { valid: false, parsed: null }
      return { valid: true, parsed: num }
    }
    case 'boolean': {
      const lower = value.toLowerCase()
      if (['true', '1', 'si', 'yes', 'verdadero', 'v', 'sí'].includes(lower)) return { valid: true, parsed: true }
      if (['false', '0', 'no', 'falso', 'f'].includes(lower)) return { valid: true, parsed: false }
      return { valid: false, parsed: null }
    }
    case 'date': {
      const d = new Date(value)
      if (isNaN(d.getTime())) return { valid: false, parsed: null }
      return { valid: true, parsed: d.toISOString() }
    }
    default:
      return { valid: true, parsed: value.trim() }
  }
}

/**
 * Para StelOrder: validacion y parsing de tipos de forma mas permisiva.
 * Los campos con dot notation (specs.stock) se parsean como number si son numericos.
 */
function validateStelOrderValue(value: string, fieldKey: string): { valid: boolean; parsed: unknown } {
  if (!value || value.trim() === '') return { valid: true, parsed: null }

  const trimmed = value.trim()

  // Campos de precio/peso/stock son numericos
  const numericFields = ['price_eur', 'cost_eur', 'weight_kg', 'credit_limit',
    'specs.stock', 'specs.stock_min', 'specs.stock_max', 'specs.vat_sale',
    'specs.min_sale_price', 'specs.price_list_1', 'specs.price_list_2',
    'specs.price_list_3', 'specs.price_list_4', 'specs.price_list_5']

  if (numericFields.includes(fieldKey)) {
    const cleaned = trimmed.replace(/\s/g, '').replace(',', '.')
    const num = Number(cleaned)
    if (isNaN(num)) return { valid: true, parsed: trimmed } // No fallar, guardar como texto
    return { valid: true, parsed: num }
  }

  // Campos booleanos
  if (fieldKey === 'active' || fieldKey === 'surcharge') {
    const lower = trimmed.toLowerCase()
    if (['true', '1', 'si', 'yes', 'verdadero', 'v', 'sí'].includes(lower)) return { valid: true, parsed: true }
    if (['false', '0', 'no', 'falso', 'f'].includes(lower)) return { valid: true, parsed: false }
    return { valid: true, parsed: trimmed }
  }

  return { valid: true, parsed: trimmed }
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export function ImportButton({
  targetTable,
  fields,
  onComplete,
  permission,
  label = 'Importar',
  className = '',
}: ImportButtonProps) {
  const { can, isSuper } = usePermissions()
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // States
  const [showModal, setShowModal] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<MappingState>({})
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ImportResults | null>(null)
  const [fileName, setFileName] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)

  // StelOrder detection
  const [stelDetection, setStelDetection] = useState<StelOrderDetection | null>(null)

  // UPSERT mode
  const [upsertMode, setUpsertMode] = useState(true)

  // Permission check
  if (permission && !can(permission) && !can('import_data') && !isSuper) return null

  // ─── File handler ───
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset
    setResults(null)
    setValidationErrors([])
    setProgress(0)
    setImporting(false)
    setStelDetection(null)
    setLoadingFile(true)

    const ext = file.name.split('.').pop()?.toLowerCase()
    const isExcel = ext === 'xlsx' || ext === 'xls'
    const isCSV = ext === 'csv'

    if (!isExcel && !isCSV) {
      addToast({ type: 'warning', title: 'Formato no soportado. Usa archivos CSV (.csv) o Excel (.xlsx).' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      setLoadingFile(false)
      return
    }

    try {
      let headers: string[]
      let rows: string[][]

      if (isExcel) {
        // Parsear XLSX con SheetJS
        const parsed = await parseXLSX(file)
        headers = parsed.headers
        rows = parsed.rows
      } else {
        // Parsear CSV
        const text = await readFileAsText(file)
        const parsed = parseCSV(text)
        headers = parsed.headers
        rows = parsed.rows
      }

      if (headers.length === 0 || rows.length === 0) {
        addToast({ type: 'error', title: 'El archivo esta vacio o no tiene datos validos' })
        if (fileInputRef.current) fileInputRef.current.value = ''
        setLoadingFile(false)
        return
      }

      setCsvHeaders(headers)
      setCsvRows(rows)
      setFileName(file.name)

      // 1. Intentar auto-detectar formato StelOrder
      const detection = detectStelOrderFormat(headers, targetTable)
      setStelDetection(detection)

      if (detection.isStelOrder && Object.keys(detection.mapping).length > 0) {
        // Usar mapping de StelOrder
        setMapping(detection.mapping)
      } else {
        // Auto-detect generico por nombre de columna
        const autoMapping = autoDetectMapping(headers, fields)
        setMapping(autoMapping)
      }

      setShowModal(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al leer el archivo'
      addToast({ type: 'error', title: msg })
    }

    setLoadingFile(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [fields, addToast, targetTable])

  // ─── Validate all rows ───
  const validateAll = useCallback((): string[] => {
    const errors: string[] = []
    const isStel = stelDetection?.isStelOrder

    if (!isStel) {
      // Check required fields are mapped (solo en modo generico)
      const mappedKeys = new Set(Object.values(mapping))
      for (const field of fields) {
        if (field.required && !mappedKeys.has(field.key)) {
          errors.push(`El campo requerido "${field.label}" no esta mapeado a ninguna columna`)
        }
      }
    }

    if (errors.length > 0) return errors

    // Check data types for first 100 rows as sample
    const sampleRows = csvRows.slice(0, 100)
    let typeErrors = 0

    for (let rowIdx = 0; rowIdx < sampleRows.length; rowIdx++) {
      const row = sampleRows[rowIdx]
      for (const [colIdxStr, fieldKey] of Object.entries(mapping)) {
        const colIdx = Number(colIdxStr)
        const field = fields.find(f => f.key === fieldKey)
        if (!field && !isStel) continue

        const value = row[colIdx] || ''
        if (!value) continue

        if (isStel) {
          // StelOrder: validacion mas permisiva
          const { valid } = validateStelOrderValue(value, fieldKey)
          if (!valid) {
            typeErrors++
            if (typeErrors <= 5) {
              errors.push(`Fila ${rowIdx + 2}: campo "${fieldKey}" tiene un valor invalido: "${value.substring(0, 30)}"`)
            }
          }
        } else if (field) {
          const { valid } = validateValue(value, field)
          if (!valid) {
            typeErrors++
            if (typeErrors <= 5) {
              errors.push(`Fila ${rowIdx + 2}: "${field.label}" tiene un valor invalido: "${value.substring(0, 30)}"`)
            }
          }
        }
      }
    }

    if (typeErrors > 5) {
      errors.push(`... y ${typeErrors - 5} errores de validacion mas`)
    }

    return errors
  }, [mapping, csvRows, fields, stelDetection])

  // ─── Import with UPSERT support ───
  const handleImport = useCallback(async () => {
    const errors = validateAll()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])
    setImporting(true)
    setProgress(0)

    const supabase = createClient()
    const importResults: ImportResults = { inserted: 0, updated: 0, skipped: 0, errors: [] }
    const BATCH_SIZE = 50
    const totalRows = csvRows.length
    const isStel = stelDetection?.isStelOrder
    const upsertKey = UPSERT_KEYS[targetTable]

    for (let i = 0; i < totalRows; i += BATCH_SIZE) {
      const batch = csvRows.slice(i, i + BATCH_SIZE)
      const records: Record<string, unknown>[] = []

      for (let bIdx = 0; bIdx < batch.length; bIdx++) {
        const row = batch[bIdx]
        const record: Record<string, unknown> = {}
        let skipRow = false

        for (const [colIdxStr, fieldKey] of Object.entries(mapping)) {
          const colIdx = Number(colIdxStr)
          const rawValue = row[colIdx] || ''

          if (isStel) {
            // StelOrder: parsing permisivo
            const { parsed } = validateStelOrderValue(rawValue, fieldKey)
            if (parsed !== null) {
              record[fieldKey] = parsed
            }
          } else {
            const field = fields.find(f => f.key === fieldKey)
            if (!field) continue

            const { valid, parsed } = validateValue(rawValue, field)
            if (!valid && field.required) {
              importResults.errors.push(`Fila ${i + bIdx + 2}: "${field.label}" invalido`)
              importResults.skipped++
              skipRow = true
              break
            }

            if (parsed !== null) {
              record[fieldKey] = parsed
            }
          }
        }

        if (!skipRow && Object.keys(record).length > 0) {
          // Expandir dot notation (specs.stock -> { specs: { stock: ... } })
          const expanded = expandDotNotation(record)
          records.push(expanded)
        }
      }

      if (records.length === 0) {
        setProgress(Math.min(100, Math.round(((i + batch.length) / totalRows) * 100)))
        continue
      }

      // ── UPSERT mode: buscar existentes y actualizar ──
      if (upsertMode && upsertKey) {
        for (const record of records) {
          const keyValue = record[upsertKey]
          if (!keyValue) {
            // Sin key de upsert, insertar directamente
            const { error } = await supabase.from(targetTable).insert(record)
            if (error) {
              if (error.code === '23505') {
                importResults.skipped++
              } else {
                importResults.errors.push(`Error: ${error.message?.substring(0, 80)}`)
                importResults.skipped++
              }
            } else {
              importResults.inserted++
            }
            continue
          }

          // Buscar si ya existe
          const { data: existing } = await supabase
            .from(targetTable)
            .select('id')
            .eq(upsertKey, keyValue)
            .limit(1)

          if (existing && existing.length > 0) {
            // UPDATE
            const { error: updateError } = await supabase
              .from(targetTable)
              .update(record)
              .eq(upsertKey, keyValue)

            if (updateError) {
              importResults.errors.push(`Error actualizando ${upsertKey}=${keyValue}: ${updateError.message?.substring(0, 80)}`)
              importResults.skipped++
            } else {
              importResults.updated++
            }
          } else {
            // INSERT
            const { error: insertError } = await supabase
              .from(targetTable)
              .insert(record)

            if (insertError) {
              if (insertError.code === '23505') {
                importResults.skipped++
              } else {
                importResults.errors.push(`Error insertando: ${insertError.message?.substring(0, 80)}`)
                importResults.skipped++
              }
            } else {
              importResults.inserted++
            }
          }
        }
      } else {
        // ── INSERT simple (batch) ──
        const { error, data } = await supabase.from(targetTable).insert(records).select('id')

        if (error) {
          if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
            for (const record of records) {
              const { error: singleError } = await supabase.from(targetTable).insert(record)
              if (singleError) {
                if (singleError.code === '23505') {
                  importResults.skipped++
                } else {
                  importResults.errors.push(`Error: ${singleError.message?.substring(0, 80)}`)
                  importResults.skipped++
                }
              } else {
                importResults.inserted++
              }
            }
          } else {
            importResults.errors.push(`Error batch: ${error.message?.substring(0, 100)}`)
            importResults.skipped += records.length
          }
        } else {
          importResults.inserted += data?.length || records.length
        }
      }

      setProgress(Math.min(100, Math.round(((i + batch.length) / totalRows) * 100)))
    }

    setImporting(false)
    setProgress(100)
    setResults(importResults)
    onComplete?.(importResults)

    if (importResults.inserted > 0 || importResults.updated > 0) {
      addToast({
        type: 'success',
        title: `Importacion completada: ${importResults.inserted} insertados, ${importResults.updated} actualizados`,
      })
    }
  }, [validateAll, csvRows, mapping, fields, targetTable, onComplete, addToast, stelDetection, upsertMode])

  // ─── Close & reset ───
  const handleClose = useCallback(() => {
    setShowModal(false)
    setCsvHeaders([])
    setCsvRows([])
    setMapping({})
    setValidationErrors([])
    setImporting(false)
    setProgress(0)
    setResults(null)
    setFileName('')
    setStelDetection(null)
    setLoadingFile(false)
  }, [])

  // ─── Mapping change ───
  const updateMapping = useCallback((colIdx: number, fieldKey: string) => {
    setMapping(prev => {
      const next = { ...prev }
      if (fieldKey === '') {
        delete next[colIdx]
      } else {
        next[colIdx] = fieldKey
      }
      return next
    })
    setValidationErrors([])
  }, [])

  // ─── Construct combined fields list (original + StelOrder extra fields) ───
  const allFields: ImportField[] = [...fields]
  if (stelDetection?.isStelOrder) {
    // Agregar campos extra del mapping StelOrder que no estan en fields
    const existingKeys = new Set(fields.map(f => f.key))
    const mappedValues = Object.values(stelDetection.mapping)
    for (const fieldKey of mappedValues) {
      if (!existingKeys.has(fieldKey) && !fieldKey.includes('.')) {
        allFields.push({ key: fieldKey, label: fieldKey })
      }
    }
  }

  // ─── Preview rows (first 10) ───
  const previewRows = csvRows.slice(0, 10)

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loadingFile}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#9CA3AF] bg-[#141820] border border-[#2A3040] rounded-lg hover:bg-[#1C2230] hover:text-[#FF6600] transition-all disabled:opacity-50 ${className}`}
      >
        {loadingFile ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Upload size={16} />
        )}
        {loadingFile ? 'Cargando...' : label}
      </button>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!importing ? handleClose : undefined} />
          <div className="relative w-full mx-4 max-w-[90vw] bg-[#141820] border border-[#1E2330] rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2330]">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#F0F2F5]">Importar datos</h2>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {isXLSXFile({ name: fileName } as File) ? (
                      <FileSpreadsheet size={12} className="inline mr-1 text-green-400" />
                    ) : (
                      <FileText size={12} className="inline mr-1" />
                    )}
                    {fileName} &mdash; {csvRows.length} filas detectadas
                  </p>
                </div>

                {/* StelOrder badge */}
                {stelDetection?.isStelOrder && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <CheckCircle size={14} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">
                      Formato StelOrder detectado
                    </span>
                    <span className="text-[10px] text-emerald-500/70 ml-1">
                      ({stelDetection.matchedColumns} columnas mapeadas)
                    </span>
                  </div>
                )}
              </div>

              {!importing && (
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#F0F2F5] transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">

              {/* ─── UPSERT Toggle ─── */}
              <div className="flex items-center gap-4 bg-[#1C2230] rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${upsertMode ? 'bg-[#FF6600]' : 'bg-[#2A3040]'}`}
                    onClick={() => setUpsertMode(!upsertMode)}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${upsertMode ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-[#F0F2F5] flex items-center gap-2">
                      <RefreshCw size={14} className={upsertMode ? 'text-[#FF6600]' : 'text-[#6B7280]'} />
                      Actualizar existentes
                    </span>
                    <p className="text-[10px] text-[#6B7280] mt-0.5">
                      {upsertMode
                        ? `Si un registro con el mismo ${UPSERT_KEYS[targetTable] || 'ID'} ya existe, se actualiza en vez de duplicar`
                        : 'Solo se insertan registros nuevos; los duplicados se omiten'
                      }
                    </p>
                  </div>
                </label>
              </div>

              {/* ─── Column Mapping ─── */}
              {stelDetection?.isStelOrder ? (
                <div>
                  <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3 flex items-center gap-2">
                    Mapeo automatico StelOrder
                    <span className="text-[10px] text-[#6B7280] font-normal">
                      (podes ajustarlo si necesitas)
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {csvHeaders.map((header, idx) => {
                      const mappedKey = mapping[idx]
                      const isMapped = !!mappedKey
                      return (
                        <div key={idx} className={`flex items-center gap-2 rounded-lg p-3 ${isMapped ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-[#1C2230]'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[#9CA3AF] truncate" title={header}>
                              StelOrder: <span className="text-[#F0F2F5] font-medium">{header}</span>
                            </p>
                          </div>
                          <ArrowRight size={14} className={isMapped ? 'text-emerald-400 shrink-0' : 'text-[#4B5563] shrink-0'} />
                          <select
                            value={mappedKey || ''}
                            onChange={(e) => updateMapping(idx, e.target.value)}
                            className="bg-[#141820] border border-[#2A3040] rounded-lg px-2 py-1.5 text-xs text-[#F0F2F5] max-w-[160px] focus:outline-none focus:border-[#FF6600]"
                          >
                            <option value="">-- No importar --</option>
                            {allFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}{f.required ? ' *' : ''}
                              </option>
                            ))}
                            {/* Extra: show mapped key if not in allFields */}
                            {mappedKey && !allFields.find(f => f.key === mappedKey) && (
                              <option value={mappedKey}>{mappedKey}</option>
                            )}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">Mapeo de columnas</h3>
                  <p className="text-xs text-[#6B7280] mb-3">
                    Selecciona a que campo corresponde cada columna del archivo. Los campos marcados con * son obligatorios.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {csvHeaders.map((header, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-[#1C2230] rounded-lg p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#9CA3AF] truncate" title={header}>
                            Columna: <span className="text-[#F0F2F5] font-medium">{header}</span>
                          </p>
                        </div>
                        <ArrowRight size={14} className="text-[#4B5563] shrink-0" />
                        <select
                          value={mapping[idx] || ''}
                          onChange={(e) => updateMapping(idx, e.target.value)}
                          className="bg-[#141820] border border-[#2A3040] rounded-lg px-2 py-1.5 text-xs text-[#F0F2F5] max-w-[160px] focus:outline-none focus:border-[#FF6600]"
                        >
                          <option value="">-- No importar --</option>
                          {fields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}{f.required ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Preview Table ─── */}
              <div>
                <h3 className="text-sm font-semibold text-[#F0F2F5] mb-3">
                  Vista previa <span className="text-[#6B7280] font-normal">(primeras {previewRows.length} filas de {csvRows.length})</span>
                </h3>
                <div className="overflow-x-auto rounded-lg border border-[#1E2330]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#1C2230]">
                        <th className="px-3 py-2 text-left text-[#6B7280] font-medium">#</th>
                        {csvHeaders.map((h, idx) => {
                          const mappedFieldKey = mapping[idx]
                          const mappedField = fields.find(f => f.key === mappedFieldKey)
                          return (
                            <th key={idx} className="px-3 py-2 text-left min-w-[120px]">
                              <span className="text-[#6B7280]">{h}</span>
                              {mappedFieldKey && (
                                <span className={`block text-[10px] mt-0.5 ${stelDetection?.isStelOrder ? 'text-emerald-400' : 'text-[#FF6600]'}`}>
                                  &rarr; {mappedField?.label || mappedFieldKey}
                                </span>
                              )}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-t border-[#1E2330] hover:bg-[#1C2230]/50">
                          <td className="px-3 py-2 text-[#4B5563]">{rowIdx + 1}</td>
                          {csvHeaders.map((_, colIdx) => {
                            const val = row[colIdx] || ''
                            const mappedFieldKey = mapping[colIdx]
                            const field = mappedFieldKey ? fields.find(f => f.key === mappedFieldKey) : null
                            const hasError = field && val ? !validateValue(val, field).valid : false
                            return (
                              <td
                                key={colIdx}
                                className={`px-3 py-2 text-[#F0F2F5] max-w-[200px] truncate ${
                                  !mappedFieldKey ? 'text-[#4B5563]' : ''
                                } ${hasError ? 'text-red-400 bg-red-500/5' : ''}`}
                                title={val}
                              >
                                {val || <span className="text-[#2A3040]">&mdash;</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─── Validation Errors ─── */}
              {validationErrors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-400" />
                    <h4 className="text-sm font-semibold text-red-400">Errores de validacion</h4>
                  </div>
                  <ul className="space-y-1">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="text-xs text-red-300">&bull; {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ─── Progress ─── */}
              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#9CA3AF] flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-[#FF6600]" />
                      {upsertMode ? 'Importando con actualizacion...' : 'Importando...'}
                    </span>
                    <span className="text-[#FF6600] font-bold">{progress}%</span>
                  </div>
                  <div className="w-full bg-[#1E2330] rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-[#FF6600] rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ─── Results ─── */}
              {results && (
                <div className="bg-[#1C2230] border border-[#2A3040] rounded-lg p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-[#F0F2F5]">Resultado de la importacion</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#141820] rounded-lg p-3 text-center">
                      <CheckCircle size={18} className="text-green-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-green-400">{results.inserted}</p>
                      <p className="text-[10px] text-[#6B7280]">Insertados nuevos</p>
                    </div>
                    <div className="bg-[#141820] rounded-lg p-3 text-center">
                      <RefreshCw size={18} className="text-blue-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-blue-400">{results.updated}</p>
                      <p className="text-[10px] text-[#6B7280]">Actualizados</p>
                    </div>
                    <div className="bg-[#141820] rounded-lg p-3 text-center">
                      <AlertTriangle size={18} className="text-yellow-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-yellow-400">{results.skipped}</p>
                      <p className="text-[10px] text-[#6B7280]">Omitidos</p>
                    </div>
                    <div className="bg-[#141820] rounded-lg p-3 text-center">
                      <XCircle size={18} className="text-red-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-red-400">{results.errors.length}</p>
                      <p className="text-[10px] text-[#6B7280]">Errores</p>
                    </div>
                  </div>

                  {/* Summary bar */}
                  {(results.inserted + results.updated + results.skipped) > 0 && (
                    <div className="w-full h-3 rounded-full overflow-hidden flex bg-[#141820]">
                      {results.inserted > 0 && (
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(results.inserted / (results.inserted + results.updated + results.skipped + results.errors.length)) * 100}%` }}
                          title={`${results.inserted} insertados`}
                        />
                      )}
                      {results.updated > 0 && (
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${(results.updated / (results.inserted + results.updated + results.skipped + results.errors.length)) * 100}%` }}
                          title={`${results.updated} actualizados`}
                        />
                      )}
                      {results.skipped > 0 && (
                        <div
                          className="h-full bg-yellow-500 transition-all"
                          style={{ width: `${(results.skipped / (results.inserted + results.updated + results.skipped + results.errors.length)) * 100}%` }}
                          title={`${results.skipped} omitidos`}
                        />
                      )}
                      {results.errors.length > 0 && (
                        <div
                          className="h-full bg-red-500 transition-all"
                          style={{ width: `${(results.errors.length / (results.inserted + results.updated + results.skipped + results.errors.length)) * 100}%` }}
                          title={`${results.errors.length} errores`}
                        />
                      )}
                    </div>
                  )}

                  {results.errors.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {results.errors.slice(0, 20).map((err, i) => (
                        <p key={i} className="text-xs text-red-300">&bull; {err}</p>
                      ))}
                      {results.errors.length > 20 && (
                        <p className="text-xs text-[#6B7280]">... y {results.errors.length - 20} errores mas</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── File format tip ─── */}
              <p className="text-[10px] text-[#4B5563]">
                Se aceptan archivos CSV (.csv) y Excel (.xlsx). Las exportaciones de StelOrder se detectan automaticamente.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#1E2330] bg-[#0F1318]">
              <p className="text-xs text-[#6B7280]">
                {Object.keys(mapping).length} columnas mapeadas de {csvHeaders.length}
                {stelDetection?.isStelOrder && (
                  <span className="text-emerald-400 ml-2">(StelOrder)</span>
                )}
              </p>
              <div className="flex gap-3">
                {!importing && !results && (
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                {results ? (
                  <button
                    onClick={handleClose}
                    className="px-5 py-2 text-sm font-medium bg-[#FF6600] text-white rounded-lg hover:bg-[#FF6600]/90 transition-colors"
                  >
                    Cerrar
                  </button>
                ) : (
                  <button
                    onClick={handleImport}
                    disabled={importing || Object.keys(mapping).length === 0}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#FF6600] text-white rounded-lg hover:bg-[#FF6600]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Importar {csvRows.length} filas
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
