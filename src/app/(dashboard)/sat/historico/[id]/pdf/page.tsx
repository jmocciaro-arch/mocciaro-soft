'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizeModel } from '@/lib/sat/fein-data'
import { fmtNumber } from '@/lib/sat/currency-converter'
import { Printer, Download } from 'lucide-react'

type Row = Record<string, unknown>

/**
 * Hoja de mantenimiento imprimible.
 * Diseñada para Cmd+P → Save as PDF (A4 vertical, márgenes estrechos).
 * Incluye: datos del activo, specs FEIN, partes antes/después, torque completo con Cp/Cpk, firma.
 */
export default function ServicePdfPage() {
  const { id } = useParams() as { id: string }
  const [service, setService] = useState<Row | null>(null)
  const [asset, setAsset] = useState<Row | null>(null)
  const [client, setClient] = useState<Row | null>(null)
  const [modelSpecs, setModelSpecs] = useState<Row | null>(null)
  const [company, setCompany] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const sb = createClient()
      const { data: s } = await sb
        .from('tt_sat_service_history')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      setService(s as Row | null)
      if (s?.asset_id) {
        const { data: a } = await sb.from('tt_sat_assets').select('*').eq('id', s.asset_id).maybeSingle()
        setAsset(a as Row | null)
        if (a?.client_id) {
          const { data: c } = await sb.from('tt_clients').select('*').eq('id', a.client_id).maybeSingle()
          setClient(c as Row | null)
        }
        if (a?.model) {
          const { data: m } = await sb.from('tt_fein_models').select('*').eq('model_code', normalizeModel(a.model as string)).maybeSingle()
          setModelSpecs(m as Row | null)
        }
        if (a?.company_id) {
          const { data: co } = await sb.from('tt_companies').select('*').eq('id', a.company_id).maybeSingle()
          setCompany(co as Row | null)
        }
      }
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="text-center py-8">Cargando…</div>
  if (!service) return <div className="text-center py-8">Servicio no encontrado</div>

  const torque = (service.torque_measurements as Record<string, unknown>) || {}
  const partes = (service.partes as { antes?: Record<string, string>; despues?: Record<string, string> }) || {}
  const medicionesRaw = Array.isArray(torque.tgt) ? (torque.tgt as unknown[]) : Array(10).fill(null)
  const mediciones: Array<number | null> = medicionesRaw.map((x) =>
    x === null || x === undefined ? null : (typeof x === 'number' ? x : parseFloat(String(x)))
  )
  const cpVal = (torque.cp as number | null | undefined) ?? null
  const cpkVal = (torque.cpk as number | null | undefined) ?? null

  // Helper para formatear numbers unknown → string
  const fmt2 = (v: unknown): string => {
    if (v === null || v === undefined) return '—'
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return isNaN(n) ? '—' : n.toFixed(2)
  }
  const fmt3 = (v: unknown): string => {
    if (v === null || v === undefined) return '—'
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return isNaN(n) ? '—' : n.toFixed(3)
  }

  const resultado =
    torque.result === 'CAPAZ'
      ? { label: '✓ CAPAZ', bg: '#D1FAE5', color: '#059669', border: '#10B981' }
      : torque.result === 'REVISAR'
      ? { label: '⚠ REVISAR', bg: '#FEE2E2', color: '#DC2626', border: '#EF4444' }
      : { label: '—', bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
        }
        .sheet {
          max-width: 210mm;
          min-height: 297mm;
          margin: 20px auto;
          padding: 20mm;
          background: white;
          color: #111;
          font-family: 'DM Sans', system-ui, sans-serif;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          font-size: 11px;
          line-height: 1.4;
        }
        .sheet h1 { font-size: 20px; margin: 0 0 4px 0; color: #0A0C0F; }
        .sheet h2 { font-size: 12px; margin: 12px 0 6px 0; color: #F97316; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 2px solid #F97316; padding-bottom: 2px; }
        .sheet table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .sheet td, .sheet th { border: 1px solid #D1D5DB; padding: 4px 6px; text-align: left; vertical-align: top; }
        .sheet th { background: #F3F4F6; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.4px; }
        .sheet .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .sheet .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .sheet .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .sheet .stat { border: 1px solid #D1D5DB; border-radius: 4px; padding: 6px 8px; }
        .sheet .stat-l { font-size: 8px; color: #6B7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.3px; }
        .sheet .stat-v { font-size: 16px; font-weight: 800; color: #0A0C0F; font-family: ui-monospace, monospace; }
        .sheet .ok { color: #059669; font-weight: 700; }
        .sheet .nok { color: #DC2626; font-weight: 700; }
        .sheet .chip { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; }
        .sheet .signature-box { border: 1px solid #D1D5DB; height: 60px; border-radius: 4px; }
      `}</style>

      <div className="no-print flex justify-center gap-2 py-4" style={{ background: '#0A0C0F' }}>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
          style={{ background: '#F97316', color: '#0A0C0F' }}
        >
          <Printer size={16} /> Imprimir / Guardar PDF
        </button>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold"
          style={{ background: '#1E2330', color: '#E8EAF0', border: '1px solid rgba(255,255,255,0.11)' }}
        >
          Volver
        </button>
      </div>

      <div className="sheet">
        {/* HEADER */}
        <table style={{ border: 'none', marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ border: 'none', padding: 0 }}>
                <h1>HOJA DE MANTENIMIENTO</h1>
                <div style={{ fontSize: 10, color: '#6B7280' }}>
                  Servicio N° <strong style={{ color: '#F97316' }}>#{service.service_number as number}</strong>
                  {' · '}Fecha <strong>{service.fecha as string}</strong>
                  {' · '}Tipo <strong>{service.tipo as string}</strong>
                </div>
              </td>
              <td style={{ border: 'none', padding: 0, textAlign: 'right', width: '40%' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F97316', letterSpacing: -0.5 }}>
                  {(company?.name as string) || 'TorqueTools SL'}
                </div>
                <div style={{ fontSize: 9, color: '#6B7280' }}>
                  Servicio Técnico Autorizado
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* DATOS ACTIVO + CLIENTE */}
        <h2>Datos del equipo y cliente</h2>
        <div className="grid2">
          <table>
            <tbody>
              <tr><th>Referencia</th><td style={{ fontFamily: 'ui-monospace', color: '#F97316', fontWeight: 700 }}>{asset?.ref as string || '—'}</td></tr>
              <tr><th>ID interno</th><td>{asset?.internal_id as string || '—'}</td></tr>
              <tr><th>N° Serie</th><td style={{ fontFamily: 'ui-monospace' }}>{asset?.serial_number as string || '—'}</td></tr>
              <tr><th>Marca</th><td>{asset?.brand as string || '—'}</td></tr>
              <tr><th>Modelo</th><td style={{ fontWeight: 700 }}>{asset?.model as string || '—'}</td></tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr><th>Cliente</th><td style={{ fontWeight: 700 }}>{(client?.name as string) || (asset?.client_name_raw as string) || '—'}</td></tr>
              <tr><th>Ubicación</th><td>{asset?.city as string || '—'}, {asset?.province as string || '—'}</td></tr>
              <tr><th>Técnico recepción</th><td>{service.tecnico_recepcion as string || service.tecnico as string || '—'}</td></tr>
              <tr><th>Técnico manto.</th><td>{service.tecnico_mant as string || service.tecnico as string || '—'}</td></tr>
              <tr><th>Tiempo trabajo</th><td>{service.tiempo_horas ? `${service.tiempo_horas} horas` : '—'}</td></tr>
            </tbody>
          </table>
        </div>

        {/* SPECS DEL MODELO */}
        {modelSpecs && (
          <>
            <h2>Especificaciones técnicas del modelo</h2>
            <div className="grid4">
              <div className="stat"><div className="stat-l">Par</div><div className="stat-v" style={{ color: '#F97316' }}>{String(modelSpecs.par_min ?? '—')}–{String(modelSpecs.par_max ?? '—')} {(modelSpecs.par_unit as string) || 'Nm'}</div></div>
              <div className="stat"><div className="stat-l">Velocidad</div><div className="stat-v">{String(modelSpecs.vel_min ?? '—')}–{String(modelSpecs.vel_max ?? '—')} {(modelSpecs.vel_unit as string) || 'rpm'}</div></div>
              <div className="stat"><div className="stat-l">Peso</div><div className="stat-v">{String(modelSpecs.peso ?? '—')} {(modelSpecs.peso_unit as string) || 'kg'}</div></div>
              <div className="stat"><div className="stat-l">Precisión</div><div className="stat-v" style={{ fontSize: 11 }}>{(modelSpecs.precision as string) || '—'}</div></div>
            </div>
          </>
        )}

        {/* INSPECCIÓN DE PARTES */}
        <h2>Inspección de partes — Antes y Después</h2>
        <table>
          <thead>
            <tr>
              <th>Parte</th><th style={{ width: 80 }}>Ingreso</th><th style={{ width: 80 }}>Post-reparación</th>
            </tr>
          </thead>
          <tbody>
            {['carcasa', 'tornillos', 'conectores', 'embrague', 'firmware', 'reversa', 'cabezal', 'rotor'].map((k) => {
              const antes = partes.antes?.[k] || ''
              const despues = partes.despues?.[k] || ''
              return (
                <tr key={k}>
                  <td style={{ textTransform: 'capitalize' }}>{k}</td>
                  <td style={{ textAlign: 'center' }} className={antes === 'OK' ? 'ok' : antes === 'NOK' ? 'nok' : ''}>{antes || '—'}</td>
                  <td style={{ textAlign: 'center' }} className={despues === 'OK' ? 'ok' : despues === 'NOK' ? 'nok' : ''}>{despues || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* TORQUE */}
        <h2>Certificación de Torque</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 6 }}>
          <div className="stat"><div className="stat-l">LCI</div><div className="stat-v">{fmt2(torque.lci)} {(torque.unit as string) || 'Nm'}</div></div>
          <div className="stat"><div className="stat-l">Nominal</div><div className="stat-v" style={{ color: '#F97316' }}>{fmt2(torque.nom)} {(torque.unit as string) || 'Nm'}</div></div>
          <div className="stat"><div className="stat-l">LCS</div><div className="stat-v">{fmt2(torque.lcs)} {(torque.unit as string) || 'Nm'}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>N°</th><th>Medición</th><th>Desvío % vs nominal</th>
            </tr>
          </thead>
          <tbody>
            {mediciones.map((v, i) => {
              const nom = (torque.nom as number | null | undefined) ?? null
              const desvio = v !== null && v !== undefined && nom !== null && nom !== 0
                ? (((v as number) - nom) / nom * 100).toFixed(2) + '%'
                : '—'
              return (
                <tr key={i}>
                  <td style={{ textAlign: 'center', fontFamily: 'ui-monospace' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'ui-monospace' }}>{fmt2(v)}</td>
                  <td style={{ fontFamily: 'ui-monospace', color: '#6B7280' }}>{desvio}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* CP CPK */}
        <div className="grid4" style={{ marginTop: 8 }}>
          <div className="stat"><div className="stat-l">Promedio</div><div className="stat-v">{fmt2(torque.mean)}</div></div>
          <div className="stat"><div className="stat-l">σ (desv est.)</div><div className="stat-v">{fmt3(torque.std_dev)}</div></div>
          <div className="stat" style={{ background: cpVal !== null && cpVal >= 1.33 ? '#D1FAE5' : '#FEF3C7' }}>
            <div className="stat-l">Cp</div>
            <div className="stat-v" style={{ color: cpVal !== null && cpVal >= 1.33 ? '#059669' : '#D97706' }}>{fmt3(cpVal)}</div>
          </div>
          <div className="stat" style={{ background: cpkVal !== null && cpkVal >= 1.33 ? '#D1FAE5' : '#FEF3C7' }}>
            <div className="stat-l">Cpk</div>
            <div className="stat-v" style={{ color: cpkVal !== null && cpkVal >= 1.33 ? '#059669' : '#D97706' }}>{fmt3(cpkVal)}</div>
          </div>
        </div>

        {/* RESULTADO */}
        <div style={{
          marginTop: 12, padding: 12, textAlign: 'center', borderRadius: 6,
          background: resultado.bg, color: resultado.color,
          border: `2px solid ${resultado.border}`, fontSize: 18, fontWeight: 800, letterSpacing: 0.5,
        }}>
          {resultado.label}
        </div>

        {/* FOTOS IN/OUT */}
        {(() => {
          const photosIn = (service.photos_in as Array<{ url: string; caption?: string }>) || []
          const photosOut = (service.photos_out as Array<{ url: string; caption?: string }>) || []
          if (photosIn.length === 0 && photosOut.length === 0) return null
          return (
            <>
              <h2>Fotos — Ingreso y Egreso</h2>
              <div className="grid2">
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#C2410C', marginBottom: 4 }}>INGRESO ({photosIn.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                    {photosIn.slice(0, 6).map((p, i) => (
                      <img key={i} src={p.url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', border: '1px solid #D1D5DB', borderRadius: 3 }} />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', marginBottom: 4 }}>EGRESO ({photosOut.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                    {photosOut.slice(0, 6).map((p, i) => (
                      <img key={i} src={p.url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', border: '1px solid #D1D5DB', borderRadius: 3 }} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )
        })()}

        {/* OBSERVACIONES */}
        <h2>Observaciones</h2>
        <div style={{ border: '1px solid #D1D5DB', padding: 8, borderRadius: 4, minHeight: 40, whiteSpace: 'pre-wrap', fontSize: 10 }}>
          {service.obs as string || '—'}
        </div>

        {/* COTO TOTAL */}
        {!!service.cot_total && (
          <div style={{ marginTop: 10, padding: 8, background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#C2410C' }}>TOTAL COTIZADO</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#C2410C', fontFamily: 'ui-monospace' }}>$ {fmtNumber(service.cot_total as number)} USD</span>
          </div>
        )}

        {/* FIRMAS */}
        <h2 style={{ marginTop: 16 }}>Firmas</h2>
        <div className="grid2">
          <div>
            <div className="stat-l" style={{ marginBottom: 4 }}>Técnico responsable</div>
            <div className="signature-box"></div>
            <div style={{ fontSize: 10, marginTop: 2, textAlign: 'center' }}>{service.tecnico as string || ''}</div>
          </div>
          <div>
            <div className="stat-l" style={{ marginBottom: 4 }}>Cliente / Conformidad</div>
            <div className="signature-box"></div>
            <div style={{ fontSize: 10, marginTop: 2, textAlign: 'center', color: '#6B7280' }}>Firma y aclaración</div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: 20, paddingTop: 8, borderTop: '1px solid #D1D5DB', fontSize: 9, color: '#9CA3AF', display: 'flex', justifyContent: 'space-between' }}>
          <span>ID Servicio: <span style={{ fontFamily: 'ui-monospace' }}>{(service.id as string)?.slice(0, 8)}</span></span>
          <span>Generado: {new Date().toLocaleString('es-AR')}</span>
          <span>{(company?.name as string) || 'TorqueTools SL'}</span>
        </div>
      </div>
    </>
  )
}
