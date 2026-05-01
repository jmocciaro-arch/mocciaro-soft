'use client'

/**
 * Bulk Import de clientes desde CSV — estilo Stripe / Shopify.
 * 3 pasos: Upload → Mapeo de columnas → Preview → Importación con progreso.
 */

import { useState, useCallback, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, FileText, CheckCircle2, XCircle, ArrowRight, ArrowLeft,
  AlertTriangle, Save, RefreshCw,
} from 'lucide-react'

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

interface ParsedRow {
  [key: string]: string
}

interface ColumnMapping {
  csvColumn: string
  dbField: string
}

interface FieldDef { key: string; label: string; required?: boolean }
const DB_FIELDS: FieldDef[] = [
  { key: 'name',          label: 'Razón social',  required: true },
  { key: 'trade_name',    label: 'Nombre fantasía' },
  { key: 'tax_id',        label: 'CUIT/CIF/EIN' },
  { key: 'email',         label: 'Email' },
  { key: 'phone',         label: 'Teléfono' },
  { key: 'whatsapp',      label: 'WhatsApp' },
  { key: 'website',       label: 'Sitio web' },
  { key: 'country',       label: 'País (ISO 2)' },
  { key: 'address_street',label: 'Calle' },
  { key: 'address_number',label: 'Número' },
  { key: 'postal_code',   label: 'CP' },
  { key: 'city',          label: 'Ciudad' },
  { key: 'state',         label: 'Provincia/Estado' },
  { key: 'category',      label: 'Categoría (A/B/distribuidor)' },
  { key: 'payment_terms', label: 'Condición de pago' },
  { key: 'credit_limit',  label: 'Límite de crédito' },
  { key: 'notes',         label: 'Notas' },
]

const AUTO_MAP_KEYWORDS: Record<string, string[]> = {
  name:           ['razón social', 'razon social', 'nombre', 'name', 'company', 'empresa'],
  trade_name:     ['fantasía', 'fantasia', 'trade', 'comercial'],
  tax_id:         ['cuit', 'cif', 'nif', 'ein', 'rut', 'tax', 'identific'],
  email:          ['email', 'correo', 'mail', 'e-mail'],
  phone:          ['teléfono', 'telefono', 'phone', 'tel'],
  whatsapp:       ['whatsapp', 'wsp', 'wa'],
  website:        ['web', 'sitio', 'website', 'url'],
  country:        ['país', 'pais', 'country'],
  address_street: ['calle', 'street', 'dirección', 'direccion', 'address'],
  address_number: ['número', 'numero', 'number', 'nro'],
  postal_code:    ['cp', 'zip', 'postal', 'código postal', 'codigo postal'],
  city:           ['ciudad', 'city', 'localidad'],
  state:          ['provincia', 'estado', 'state', 'region'],
  category:       ['categoría', 'categoria', 'tipo', 'category'],
  payment_terms:  ['pago', 'payment', 'condición'],
  credit_limit:   ['crédito', 'credito', 'credit'],
  notes:          ['notas', 'notes', 'observaciones', 'comentarios'],
}

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function BulkImportClientsModal({ open, onClose, onImported }: Props) {
  const { addToast } = useToast()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0, ok: 0, err: 0 })
  const [errors, setErrors] = useState<Array<{ row: number; error: string }>>([])

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setMapping([])
    setProgress({ current: 0, total: 0, ok: 0, err: 0 }); setErrors([])
  }

  const handleClose = () => {
    if (step === 'importing') return
    reset()
    onClose()
  }

  // ============== STEP 1: UPLOAD ==============
  const onFileSelected = useCallback(async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) {
      addToast({ type: 'warning', title: 'CSV vacío o sin encabezado' })
      return
    }
    // Parser simple (comas + comillas)
    const parseRow = (line: string): string[] => {
      const out: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') { inQ = !inQ; continue }
        if (c === ',' && !inQ) { out.push(cur); cur = ''; continue }
        cur += c
      }
      out.push(cur)
      return out
    }
    const hdr = parseRow(lines[0]).map(h => h.trim())
    const data: ParsedRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i])
      const row: ParsedRow = {}
      hdr.forEach((h, idx) => { row[h] = (cells[idx] || '').trim() })
      data.push(row)
    }
    setHeaders(hdr)
    setRows(data)

    // Auto-mapping
    const autoMap: ColumnMapping[] = []
    for (const h of hdr) {
      const hLower = h.toLowerCase()
      for (const [field, keywords] of Object.entries(AUTO_MAP_KEYWORDS)) {
        if (keywords.some(k => hLower.includes(k))) {
          autoMap.push({ csvColumn: h, dbField: field })
          break
        }
      }
    }
    setMapping(autoMap)
    setStep('mapping')
  }, [addToast])

  // ============== STEP 2: MAPPING ==============
  const setMappingFor = (csvColumn: string, dbField: string) => {
    setMapping(prev => {
      const filtered = prev.filter(m => m.csvColumn !== csvColumn)
      if (dbField) filtered.push({ csvColumn, dbField })
      return filtered
    })
  }
  const getMappedField = (csvColumn: string) => mapping.find(m => m.csvColumn === csvColumn)?.dbField || ''

  const requiredMapped = DB_FIELDS.filter(f => f.required).every(f => mapping.some(m => m.dbField === f.key))

  // ============== STEP 3: PREVIEW + IMPORT ==============
  const previewRows = rows.slice(0, 5).map(r => {
    const out: ParsedRow = {}
    for (const m of mapping) out[m.dbField] = r[m.csvColumn] || ''
    return out
  })

  const startImport = async () => {
    setStep('importing')
    setProgress({ current: 0, total: rows.length, ok: 0, err: 0 })
    const errs: Array<{ row: number; error: string }> = []
    let ok = 0

    const BATCH = 50
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const payload = batch.map((r, idx) => {
        const obj: Record<string, unknown> = { active: true }
        for (const m of mapping) {
          const v = r[m.csvColumn]
          if (!v) continue
          if (m.dbField === 'credit_limit') obj[m.dbField] = parseFloat(v.replace(/[^\d.-]/g, '')) || null
          else obj[m.dbField] = v
        }
        // Validar required
        if (!obj.name) {
          errs.push({ row: i + idx + 2, error: 'Sin razón social' })
          return null
        }
        return obj
      }).filter(Boolean) as Array<Record<string, unknown>>

      if (payload.length > 0) {
        const { error } = await supabase.from('tt_clients').insert(payload)
        if (error) {
          errs.push({ row: i + 2, error: error.message })
        } else {
          ok += payload.length
        }
      }
      setProgress({ current: Math.min(i + BATCH, rows.length), total: rows.length, ok, err: errs.length })
    }

    setErrors(errs)
    setStep('done')
    onImported()
  }

  // ============== RENDER ==============
  return (
    <Modal isOpen={open} onClose={handleClose} title="Importar clientes desde CSV" size="xl">
      <div className="space-y-4">
        {/* Stepper */}
        <div className="flex items-center justify-between">
          {[
            { id: 'upload',    label: '1. Subir CSV' },
            { id: 'mapping',   label: '2. Mapear' },
            { id: 'preview',   label: '3. Preview' },
            { id: 'importing', label: '4. Importar' },
          ].map((s, i, arr) => {
            const stepIdx = ['upload','mapping','preview','importing','done'].indexOf(step)
            const sIdx = ['upload','mapping','preview','importing'].indexOf(s.id)
            const done = stepIdx > sIdx
            const active = stepIdx === sIdx
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 ${active ? 'text-[#FF6600]' : done ? 'text-emerald-400' : 'text-[#6B7280]'}`}>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                    active ? 'border-[#FF6600] bg-[#FF6600]/10' :
                    done   ? 'border-emerald-400 bg-emerald-400/10' : 'border-[#2A3040]'
                  }`}>
                    {done ? <CheckCircle2 size={11} /> : i + 1}
                  </div>
                  <span className="text-xs font-semibold">{s.label}</span>
                </div>
                {i < arr.length - 1 && <div className="flex-1 h-px bg-[#1E2330] mx-2" />}
              </div>
            )
          })}
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) onFileSelected(f)
            }}
            className="rounded-xl border-2 border-dashed border-[#2A3040] hover:border-[#FF6600]/50 bg-[#0F1218] p-12 text-center transition cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} className="text-[#FF6600] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#F0F2F5]">Arrastrá tu CSV o click para elegir</p>
            <p className="text-xs text-[#6B7280] mt-1">UTF-8, separado por comas, primera fila con encabezados</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
            />
            <div className="mt-6 text-[10px] text-[#4B5563]">
              <p className="font-semibold uppercase mb-1">Columnas reconocidas automáticamente:</p>
              <p>razón social · CUIT/CIF · email · teléfono · país · dirección · ciudad · CP · categoría · etc</p>
            </div>
          </div>
        )}

        {/* STEP 2: MAPPING */}
        {step === 'mapping' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#9CA3AF]">
                Detectamos <strong className="text-[#F0F2F5]">{rows.length}</strong> filas con
                <strong className="text-[#F0F2F5]"> {headers.length}</strong> columnas.
                Mapeá cada columna del CSV a su campo en el sistema:
              </p>
              <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>
                <ArrowLeft size={11} /> Volver
              </Button>
            </div>
            <div className="rounded-xl border border-[#1E2330] bg-[#0F1218] divide-y divide-[#1E2330] max-h-[400px] overflow-y-auto">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-3 p-3 hover:bg-[#141820]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-[#FF6600] truncate">{h}</p>
                    <p className="text-[10px] text-[#6B7280] truncate">
                      Ej: {rows[0]?.[h]?.slice(0, 50) || '(vacío)'}
                    </p>
                  </div>
                  <ArrowRight size={11} className="text-[#4B5563] shrink-0" />
                  <select
                    value={getMappedField(h)}
                    onChange={(e) => setMappingFor(h, e.target.value)}
                    className="w-56 h-8 rounded bg-[#1E2330] border border-[#2A3040] text-xs text-[#F0F2F5] px-2"
                  >
                    <option value="">— No importar —</option>
                    {DB_FIELDS.map(f => (
                      <option key={f.key} value={f.key}>
                        {f.label}{f.required ? ' *' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!requiredMapped && (
              <div className="flex items-center gap-2 text-xs text-orange-400">
                <AlertTriangle size={12} /> Falta mapear <strong>Razón social</strong> (obligatorio)
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => setStep('preview')} disabled={!requiredMapped}>
                Vista previa <ArrowRight size={12} />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-3">
            <p className="text-xs text-[#9CA3AF]">Así se verán las primeras 5 filas al importarlas:</p>
            <div className="rounded-xl border border-[#1E2330] bg-[#0F1218] overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0A0D12]">
                  <tr className="text-left text-[10px] uppercase text-[#6B7280]">
                    {mapping.map(m => (
                      <th key={m.dbField} className="px-3 py-2 whitespace-nowrap">
                        {DB_FIELDS.find(f => f.key === m.dbField)?.label || m.dbField}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2330]">
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {mapping.map(m => (
                        <td key={m.dbField} className="px-3 py-2 text-[#F0F2F5] whitespace-nowrap">
                          {r[m.dbField] || <span className="text-[#4B5563]">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[#6B7280]">
              Mostrando 5 de {rows.length}. Al importar se procesan en batches de 50.
            </p>
            <div className="flex justify-between gap-2 pt-2 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setStep('mapping')}>
                <ArrowLeft size={11} /> Volver
              </Button>
              <Button variant="primary" onClick={startImport}>
                <Save size={12} /> Importar {rows.length} clientes
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: IMPORTING */}
        {step === 'importing' && (
          <div className="rounded-xl border border-[#FF6600]/30 bg-[#0F1218] p-8 space-y-4">
            <div className="flex items-center gap-3 justify-center">
              <RefreshCw size={20} className="text-[#FF6600] animate-spin" />
              <span className="text-sm font-semibold text-[#F0F2F5]">Importando clientes...</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-[#9CA3AF]">
                <span>{progress.current} / {progress.total}</span>
                <span>{progress.ok} OK · {progress.err} errores</span>
              </div>
              <div className="h-2 rounded-full bg-[#1E2330] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FF6600] to-emerald-400 transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: DONE */}
        {step === 'done' && (
          <div className="space-y-4">
            <div className={`rounded-xl p-6 text-center border ${
              progress.err === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-orange-500/30 bg-orange-500/5'
            }`}>
              {progress.err === 0 ? (
                <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
              ) : (
                <AlertTriangle size={32} className="text-orange-400 mx-auto mb-2" />
              )}
              <p className="text-lg font-bold text-[#F0F2F5]">
                {progress.ok} clientes importados
              </p>
              {progress.err > 0 && (
                <p className="text-sm text-orange-400 mt-1">{progress.err} errores</p>
              )}
            </div>

            {errors.length > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-red-400 mb-2">Errores detectados:</p>
                <ul className="text-[11px] text-[#9CA3AF] space-y-1 font-mono">
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i}>Fila {e.row}: {e.error}</li>
                  ))}
                  {errors.length > 20 && <li className="text-[#6B7280]">... y {errors.length - 20} más</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
