'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AssetSelector } from '@/components/sat/asset-selector'
import { InspectionGrid, type InspectionState, type PartStatus, emptyInspection } from '@/components/sat/inspection-grid'
import { MediaCapture } from '@/components/sat/media-capture'
import { VoiceRecorder } from '@/components/ai/voice-recorder'
import { PARTS, PART_LBL, normalizeModel, type PartKey } from '@/lib/sat/fein-data'
import type { DiagnosticoData, InspectionPart, WorkflowPhoto } from '../sat-workflow-types'

interface StepDiagnosticoProps {
  data: DiagnosticoData
  onChange: (data: DiagnosticoData) => void
  readOnly?: boolean
  ticketId?: string
}

interface AssetRow {
  id: string
  ref: string
  internal_id: string | null
  serial_number: string | null
  brand: string
  model: string | null
  model_normalized: string | null
  client_id: string | null
  client_name_raw: string | null
  city: string | null
  province: string | null
  tt_clients?: { name: string } | null
}

interface ModelSpecs {
  model_code: string
  name: string | null
  tipo: string | null
  par_min: number | null
  par_max: number | null
  par_unit: string | null
  vel_min: number | null
  vel_max: number | null
  vel_fabrica: number | null
  vel_unit: string | null
  peso: number | null
  peso_unit: string | null
  interfaz: string | null
  precision: string | null
  uso: string | null
  nro_pedido: string | null
}

interface ServiceHistoryRow {
  id: string
  fecha: string
  tipo: string | null
  tecnico: string | null
  cp: number | null
  cpk: number | null
}

// Convierte array InspectionPart <-> InspectionState record
function gridToRecord(grid: InspectionPart[]): InspectionState {
  const base = emptyInspection()
  PARTS.forEach((p, i) => {
    const raw = grid[i]?.status
    if (raw === 'OK' || raw === 'NOK' || raw === 'NA') base[p] = raw as PartStatus
  })
  return base
}

function recordToGrid(record: InspectionState, prev: InspectionPart[]): InspectionPart[] {
  return PARTS.map((p, i) => {
    const st = record[p]
    const status: InspectionPart['status'] = st === 'OK' || st === 'NOK' || st === 'NA' ? st : 'NA'
    return {
      name: PART_LBL[p] || prev[i]?.name || p,
      status,
      notes: prev[i]?.notes || '',
    }
  })
}

export function StepDiagnostico({ data, onChange, readOnly, ticketId }: StepDiagnosticoProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [assetInfo, setAssetInfo] = useState<AssetRow | null>(null)
  const [modelSpecs, setModelSpecs] = useState<ModelSpecs | null>(null)
  const [history, setHistory] = useState<ServiceHistoryRow[]>([])
  const [loadingAsset, setLoadingAsset] = useState(false)

  const update = useCallback((partial: Partial<DiagnosticoData>) => {
    onChange({ ...data, ...partial })
  }, [data, onChange])

  // Inicializar grid si viene vacío
  useEffect(() => {
    if (!data.inspection_grid || data.inspection_grid.length === 0) {
      const grid: InspectionPart[] = PARTS.map((p) => ({
        name: PART_LBL[p], status: 'NA', notes: '',
      }))
      update({ inspection_grid: grid })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resolver selectedAssetId desde asset_serial si vino pre-cargado
  useEffect(() => {
    if (selectedAssetId) return
    if (!data.asset_serial) return
    const serial = data.asset_serial.trim()
    if (!serial) return
    let cancelled = false
    ;(async () => {
      const sb = createClient()
      const { data: found } = await sb
        .from('tt_sat_assets')
        .select('id')
        .or(`serial_number.eq.${serial},ref.eq.${serial}`)
        .limit(1)
        .maybeSingle()
      if (!cancelled && found?.id) setSelectedAssetId(found.id as string)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.asset_serial])

  // Al cambiar asset seleccionado, cargar datos
  useEffect(() => {
    if (!selectedAssetId) {
      setAssetInfo(null)
      setModelSpecs(null)
      setHistory([])
      return
    }
    let cancelled = false
    const run = async () => {
      setLoadingAsset(true)
      const sb = createClient()
      // 1) Activo + cliente
      const { data: asset } = await sb
        .from('tt_sat_assets')
        .select('id, ref, internal_id, serial_number, brand, model, model_normalized, client_id, client_name_raw, city, province, tt_clients(name)')
        .eq('id', selectedAssetId)
        .maybeSingle()
      if (cancelled) return
      const a = asset as AssetRow | null
      setAssetInfo(a)
      if (a) {
        const clientName = a.tt_clients?.name || a.client_name_raw || ''
        update({
          asset_serial: a.serial_number || a.ref || '',
          asset_description: [a.brand, a.model].filter(Boolean).join(' ') || '',
          client_id: a.client_id || '',
          client_name: clientName,
          brand: a.brand || '',
          model: a.model || '',
        })
        // 2) Specs del modelo
        const code = normalizeModel(a.model)
        if (code) {
          const { data: specs } = await sb
            .from('tt_fein_models')
            .select('model_code, name, tipo, par_min, par_max, par_unit, vel_min, vel_max, vel_fabrica, vel_unit, peso, peso_unit, interfaz, precision, uso, nro_pedido')
            .eq('model_code', code)
            .maybeSingle()
          if (!cancelled) setModelSpecs(specs as ModelSpecs | null)
        } else {
          setModelSpecs(null)
        }
        // 3) Historial
        const { data: hist } = await sb
          .from('tt_sat_service_history')
          .select('id, fecha, tipo, tecnico, cp, cpk')
          .eq('asset_id', a.id)
          .order('fecha', { ascending: false })
          .limit(5)
        if (!cancelled) setHistory((hist as ServiceHistoryRow[]) || [])
      }
      setLoadingAsset(false)
    }
    run().catch(() => { if (!cancelled) setLoadingAsset(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetId])

  const inspectionRecord = gridToRecord(data.inspection_grid || [])

  const onInspectionChange = (next: InspectionState) => {
    update({ inspection_grid: recordToGrid(next, data.inspection_grid || []) })
  }

  // Detectar si hay activo pre-cargado (viene desde "Iniciar mantenimiento")
  const hasPreloadedAsset = !!(selectedAssetId || (data.asset_serial && data.asset_serial.trim()))

  // Numeración dinámica según haya o no activo pre-cargado
  let n = 0
  const nextN = () => ++n

  return (
    <div className="space-y-2">
      {/* ── Sección: Filtrar y seleccionar herramienta — solo si NO hay activo pre-cargado ── */}
      {!hasPreloadedAsset && (
        <div
          style={{
            background: 'var(--sat-dk2)',
            border: '1px solid var(--sat-br)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <AssetSelector
            value={selectedAssetId}
            onChange={setSelectedAssetId}
            label={`${nextN()} · Filtrar y seleccionar herramienta`}
          />
        </div>
      )}

      {/* ── Historial de servicios — solo si NO hay activo pre-cargado (cuando hay, va al sidebar) ── */}
      {!hasPreloadedAsset && assetInfo && (
        <div
          style={{
            background: 'var(--sat-dk2)',
            border: '1px solid var(--sat-br)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="sn sn-o" style={{ marginBottom: 10 }}>{nextN()} · Historial de servicios</div>
          {loadingAsset ? (
            <div style={{ color: 'var(--sat-tx3)', fontSize: 13 }}>Cargando...</div>
          ) : history.length === 0 ? (
            <div style={{ color: 'var(--sat-tx3)', fontSize: 13, fontStyle: 'italic' }}>
              Sin servicios previos
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sat-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Técnico</th>
                    <th style={{ textAlign: 'right' }}>Cp</th>
                    <th style={{ textAlign: 'right' }}>Cpk</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontFamily: 'var(--sat-mo)' }}>
                        {h.fecha ? new Date(h.fecha).toLocaleDateString('es-AR') : '–'}
                      </td>
                      <td>{h.tipo || '–'}</td>
                      <td>{h.tecnico || '–'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--sat-mo)' }}>
                        {h.cp !== null ? h.cp.toFixed(2) : '–'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--sat-mo)' }}>
                        {h.cpk !== null ? h.cpk.toFixed(2) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Specs técnicas (cuando NO hay activo pre-cargado, las mostramos acá) */}
      {!hasPreloadedAsset && modelSpecs && (
        <div
          style={{
            background: 'var(--sat-dk2)',
            border: '1px solid var(--sat-br)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="sn sn-g" style={{ marginBottom: 8 }}>
            Specs · {modelSpecs.name || modelSpecs.model_code}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {modelSpecs.par_min !== null && modelSpecs.par_max !== null && (
              <InfoCell label="Par" value={`${modelSpecs.par_min}–${modelSpecs.par_max} ${modelSpecs.par_unit || ''}`} />
            )}
            {modelSpecs.vel_min !== null && modelSpecs.vel_max !== null && (
              <InfoCell label="Velocidad" value={`${modelSpecs.vel_min}–${modelSpecs.vel_max} ${modelSpecs.vel_unit || ''}`} />
            )}
            {modelSpecs.peso !== null && (
              <InfoCell label="Peso" value={`${modelSpecs.peso} ${modelSpecs.peso_unit || ''}`} />
            )}
            {modelSpecs.interfaz && <InfoCell label="Interfaz" value={modelSpecs.interfaz} />}
            {modelSpecs.precision && <InfoCell label="Precisión" value={modelSpecs.precision} color="var(--sat-gn)" />}
          </div>
        </div>
      )}

      {/* ── Datos de ingreso (fila compacta) ── */}
      <div style={{ background: 'var(--sat-dk2)', border: '1px solid var(--sat-br)', borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div className="sn sn-o" style={{ fontSize: 11, margin: 0 }}>{nextN()} · Datos de ingreso</div>
          {!readOnly && (
            <VoiceRecorder
              context="SAT maintenance form — técnico, motivo ingreso, condición visual, observaciones"
              onTranscribed={(text, structured) => {
                const partial: Partial<DiagnosticoData> = {}
                if (structured.tecnico) partial.ingreso_tecnico = structured.tecnico
                if (structured.motivo_ingreso) partial.motivo_ingreso = structured.motivo_ingreso
                if (structured.condicion_visual) partial.condicion_visual = structured.condicion_visual
                if (structured.observaciones) partial.initial_notes = structured.observaciones
                if (Object.keys(partial).length > 0) update(partial)
              }}
            />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Fecha</label>
            <input type="date" value={data.ingreso_fecha || ''} onChange={(e) => update({ ingreso_fecha: e.target.value })} readOnly={readOnly} style={{ padding: '6px 8px', fontSize: 13 }} />
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Técnico / responsable</label>
            <input type="text" value={data.ingreso_tecnico || ''} onChange={(e) => update({ ingreso_tecnico: e.target.value })} readOnly={readOnly} placeholder="Nombre" style={{ padding: '6px 8px', fontSize: 13 }} />
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Tipo servicio</label>
            <select value={data.tipo_servicio || ''} onChange={(e) => update({ tipo_servicio: (e.target.value || undefined) as 'PREVENTIVO' | 'CORRECTIVO' | undefined })} disabled={readOnly} style={{ padding: '6px 8px', fontSize: 13 }}>
              <option value="">—</option>
              <option value="PREVENTIVO">PREVENTIVO</option>
              <option value="CORRECTIVO">CORRECTIVO</option>
            </select>
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Condición visual</label>
            <input type="text" value={data.condicion_visual || ''} onChange={(e) => update({ condicion_visual: e.target.value })} readOnly={readOnly} placeholder="buena / golpes..." style={{ padding: '6px 8px', fontSize: 13 }} />
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Motivo ingreso</label>
            <input type="text" value={data.motivo_ingreso || ''} onChange={(e) => update({ motivo_ingreso: e.target.value })} readOnly={readOnly} placeholder="preventivo, falla..." style={{ padding: '6px 8px', fontSize: 13 }} />
          </div>
        </div>
      </div>

      {/* ── VIDA APRIETES + DESDE ÚLTIMO SERVICE (fila compacta) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.03))', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--sat-or)', textTransform: 'uppercase' }}>⚡ Vida aprietes (total)</div>
          </div>
          <input type="number" min={0} value={data.vida_aprietes_total ?? ''} onChange={(e) => update({ vida_aprietes_total: e.target.value === '' ? undefined : Number(e.target.value) })} readOnly={readOnly} placeholder="135000"
            style={{ width: 120, background: 'var(--sat-dk3)', border: '1px solid var(--sat-br2)', borderRadius: 6, padding: '6px 10px', color: 'var(--sat-or)', fontFamily: 'var(--sat-mo)', fontSize: 16, fontWeight: 700, textAlign: 'right' }} />
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.03))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--sat-am)', textTransform: 'uppercase' }}>🔧 Aprietes desde último service</div>
          </div>
          <input type="number" min={0} value={data.aprietes_ultimo_service ?? ''} onChange={(e) => update({ aprietes_ultimo_service: e.target.value === '' ? undefined : Number(e.target.value) })} readOnly={readOnly} placeholder="8500"
            style={{ width: 120, background: 'var(--sat-dk3)', border: '1px solid var(--sat-br2)', borderRadius: 6, padding: '6px 10px', color: 'var(--sat-am)', fontFamily: 'var(--sat-mo)', fontSize: 16, fontWeight: 700, textAlign: 'right' }} />
        </div>
      </div>

      {/* ── Diagnóstico de partes COMPACTO — grid 4 columnas tipo buscatools-fein ── */}
      <div style={{ background: 'var(--sat-dk2)', border: '1px solid var(--sat-br)', borderRadius: 10, padding: 12 }}>
        <div className="sn sn-o" style={{ marginBottom: 4, fontSize: 11 }}>{nextN()} · Diagnóstico de partes — estado al INGRESO</div>
        <p style={{ fontSize: 10, color: 'var(--sat-tx3)', marginBottom: 8, fontStyle: 'italic' }}>
          Marca el estado en que LLEGÓ la herramienta — antes de cualquier intervención
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
          {[
            { key: 'firmware', num: 3, label: 'FIRMWARE' },
            { key: 'tornillos', num: 4, label: 'TORNILLOS' },
            { key: 'embrague', num: 5, label: 'EMBRAGUE' },
            { key: 'carcasa', num: 6, label: 'CARCASA' },
            { key: 'reversa', num: 7, label: 'REVERSA' },
            { key: 'cabezal', num: 8, label: 'CABEZAL' },
            { key: 'rotor', num: 9, label: 'ROTOR' },
            { key: 'bolillas', num: 10, label: 'BOLILLAS' },
          ].map((row) => {
            const st = (inspectionRecord[row.key as keyof typeof inspectionRecord] || '') as 'OK' | 'NOK' | 'NA' | ''
            const setStatus = (status: 'OK' | 'NOK' | 'NA') => {
              const next = { ...inspectionRecord, [row.key]: st === status ? '' : status } as typeof inspectionRecord
              onInspectionChange(next)
            }
            const cardBg =
              st === 'OK' ? 'rgba(16, 185, 129, 0.08)' :
              st === 'NOK' ? 'rgba(239, 68, 68, 0.08)' : 'var(--sat-dk3)'
            const cardBorder =
              st === 'OK' ? 'rgba(16, 185, 129, 0.4)' :
              st === 'NOK' ? 'rgba(239, 68, 68, 0.4)' : 'var(--sat-br)'
            return (
              <div key={row.key} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 6, padding: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--sat-mo)', color: 'var(--sat-or)', fontWeight: 700, fontSize: 11, minWidth: 18 }}>{row.num}</span>
                  <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--sat-tx)', letterSpacing: 0.3 }}>{row.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                  {(['OK', 'NOK', 'NA'] as const).map((v) => {
                    const active = st === v
                    const color = v === 'OK' ? 'var(--sat-gn)' : v === 'NOK' ? 'var(--sat-rd)' : 'var(--sat-tx3)'
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setStatus(v)}
                        disabled={readOnly}
                        style={{
                          padding: '3px 0', borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: active ? color : 'transparent',
                          color: active ? (v === 'NOK' ? '#fff' : 'var(--sat-dk)') : 'var(--sat-tx3)',
                          border: `1px solid ${active ? color : 'var(--sat-br2)'}`,
                          cursor: readOnly ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {v === 'NA' ? 'N/A' : v}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Campos especiales compactos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--sat-br)' }}>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>🔩 Tornillos — detalle faltantes/rotos</label>
            <input type="text" value={data.tornillos_detalle || ''} onChange={(e) => update({ tornillos_detalle: e.target.value })} readOnly={readOnly} placeholder="superior izq, 2do..." style={{ padding: '5px 8px', fontSize: 12 }} />
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>⚙️ Cabezal — vida útil</label>
            <input type="text" value={data.cabezal_vida_util || ''} onChange={(e) => update({ cabezal_vida_util: e.target.value })} readOnly={readOnly} placeholder="70% / 6 meses / nuevo" style={{ padding: '5px 8px', fontSize: 12 }} />
          </div>
        </div>
      </div>

      {/* ── Reporte del problema + notas (textareas compactas lado a lado) ── */}
      <div style={{ background: 'var(--sat-dk2)', border: '1px solid var(--sat-br)', borderRadius: 10, padding: 12 }}>
        <div className="sn sn-o" style={{ marginBottom: 8, fontSize: 11 }}>{nextN()} · Problema reportado y observaciones</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Problema reportado *</label>
            <textarea
              value={data.reported_issue}
              onChange={(e) => update({ reported_issue: e.target.value })}
              readOnly={readOnly}
              placeholder="Lo que reporta el cliente..."
              style={{ minHeight: 60, resize: 'vertical', fontSize: 12, padding: '6px 8px' }}
            />
          </div>
          <div className="fg" style={{ gap: 2 }}>
            <label style={{ fontSize: 10 }}>Observaciones técnicas</label>
            <textarea
              value={data.initial_notes}
              onChange={(e) => update({ initial_notes: e.target.value })}
              readOnly={readOnly}
              placeholder="Observaciones del diagnóstico..."
              style={{ minHeight: 60, resize: 'vertical', fontSize: 12, padding: '6px 8px' }}
            />
          </div>
        </div>
      </div>

      {/* ── Fotos y videos de ingreso (compacto) ── */}
      <div style={{ background: 'var(--sat-dk2)', border: '1px solid var(--sat-br)', borderRadius: 10, padding: 12 }}>
        <div className="sn sn-o" style={{ marginBottom: 8, fontSize: 11 }}>{nextN()} · Fotos y videos de ingreso</div>
        <MediaCapture
          media={(data.photos_in || []) as WorkflowPhoto[]}
          onChange={(media) => update({ photos_in: media })}
          pathPrefix={`tickets/${ticketId || 'draft'}/in`}
          maxItems={15}
          disabled={readOnly}
        />
      </div>
    </div>
  )
}

function InfoCell({
  label, value, color, italic,
}: { label: string; value: string; color?: string; italic?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--sat-dk3)',
        border: '1px solid var(--sat-br)',
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--sat-tx3)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: color || 'var(--sat-tx)',
          fontStyle: italic ? 'italic' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  )
}
