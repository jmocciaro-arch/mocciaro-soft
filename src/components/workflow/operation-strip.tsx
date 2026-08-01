'use client'

/**
 * OperationStrip — el estado completo de una operación en una banda.
 *
 * Reemplaza a los cuatro paneles que antes se apilaban en la vista de documento
 * (línea de proceso, trazabilidad, cumplimiento por línea y timeline) y que
 * juntos ocupaban una pantalla entera antes de llegar al primer campo.
 *
 * La banda contesta las tres preguntas que el usuario tiene al abrir un
 * documento, sin que tenga que buscarlas:
 *   · dónde estoy      → stepper + cadena de documentos
 *   · qué hago ahora   → hint imperativo (reusa getNextStep)
 *   · cuánto va        → cumplimiento por línea
 *
 * El historial NO se muestra entero: se colapsa al último cambio con el
 * contador al lado. El detalle sigue estando, a un clic.
 */

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { WorkflowStep } from './workflow-arrow-bar'
import { getNextStep, inferKind } from '@/lib/next-step'

/** next-step.ts tipa el documento como un record abierto y no exporta el alias. */
type NextStepDoc = Record<string, unknown>

export interface ChainDoc {
  id: string
  doc_type: string
  ref: string
  date?: string | null
  status?: string | null
  total?: number | null
  currency?: string | null
}

export interface FulfilLine {
  sku: string
  name: string
  done: number
  total: number
}

/**
 * Resumen visual del avance. Se calcula sobre TODAS las líneas —
 * antes se computaba sobre la lista recortada y las cifras salían mal
 * (mostraba "13 de 16" cuando en realidad eran 17 de 67).
 */
function summarize(lines: FulfilLine[]) {
  let done = 0
  let total = 0
  let full = 0
  let partial = 0
  let none = 0
  for (const l of lines) {
    done += l.done
    total += l.total
    if (l.done >= l.total && l.total > 0) full++
    else if (l.done > 0) partial++
    else none++
  }
  return { done, total, full, partial, none, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

export interface LastEvent {
  label: string
  at: string
  actor?: string | null
  count: number
}

interface Props {
  steps: WorkflowStep[]
  chain: ChainDoc[]
  currentId: string
  /** Documento actual — se le pasa a getNextStep para el hint imperativo. */
  doc: NextStepDoc
  fulfilment?: FulfilLine[]
  lastEvent?: LastEvent | null
  onOpenDoc?: (id: string) => void
  onPrimaryAction?: (actionKey: string) => void
}

/** Etiqueta corta + color por tipo de documento, para las píldoras de la cadena. */
const TYPE_META: Record<string, { short: string; cls: string }> = {
  cotizacion:     { short: 'Cot', cls: 'bg-[#FF6600]/15 text-[#FF6600]' },
  presupuesto:    { short: 'Cot', cls: 'bg-[#FF6600]/15 text-[#FF6600]' },
  pedido:         { short: 'Ped', cls: 'bg-[#60A5FA]/15 text-[#60A5FA]' },
  albaran:        { short: 'Alb', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  albaran_compra: { short: 'AlbC', cls: 'bg-[#F59E0B]/15 text-[#F59E0B]' },
  factura:        { short: 'Fac', cls: 'bg-[#10B981]/15 text-[#10B981]' },
  factura_compra: { short: 'FacC', cls: 'bg-[#10B981]/15 text-[#10B981]' },
  orden_compra:   { short: 'OC',  cls: 'bg-[#A78BFA]/15 text-[#A78BFA]' },
  nota_credito:   { short: 'NC',  cls: 'bg-[#EF4444]/15 text-[#EF4444]' },
}

function typeMeta(t: string) {
  return TYPE_META[(t || '').toLowerCase()] ?? { short: (t || '?').slice(0, 4), cls: 'bg-[#2A3040] text-[#9CA3AF]' }
}

function fmtDate(d?: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtAmount(n?: number | null, cur?: string | null): string {
  if (n == null) return ''
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur || ''}`.trim()
}

export function OperationStrip({
  steps,
  chain,
  currentId,
  doc,
  fulfilment = [],
  lastEvent,
  onOpenDoc,
  onPrimaryAction,
}: Props) {
  const next = useMemo(() => getNextStep(doc, inferKind(doc)), [doc])
  const sum = useMemo(() => summarize(fulfilment), [fulfilment])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] bg-[#141820] border border-[#2A3040] rounded-xl overflow-hidden">

      {/* ── izquierda: de dónde viene ── */}
      <div className="p-5 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#6B7280] mb-3">
          Estado de la operación
        </p>

        {/* stepper */}
        <div className="flex items-center gap-0 mb-3.5 overflow-x-auto">
          {steps.map((s, i) => {
            const done = s.status === 'completed'
            const now = s.status === 'current' || s.status === 'partial'
            return (
              <div key={s.key} className="flex items-center shrink-0">
                {i > 0 && (
                  <span
                    className={`h-[1.5px] w-4 sm:w-6 mx-2 ${done || now ? 'bg-[#10B981]' : 'bg-[#2A3040]'}`}
                    aria-hidden
                  />
                )}
                <span className="flex items-center gap-1.5">
                  <span
                    className={[
                      'w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold border-[1.5px] shrink-0',
                      done ? 'bg-[#10B981] border-[#10B981] text-white' : '',
                      now ? 'bg-[#FF6600] border-[#FF6600] text-white ring-[3px] ring-[#FF6600]/15' : '',
                      !done && !now ? 'bg-[#1A1F2A] border-[#2A3040] text-[#6B7280]' : '',
                    ].join(' ')}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`text-[13px] whitespace-nowrap ${
                      now ? 'text-[#F0F2F5] font-semibold' : done ? 'text-[#9CA3AF]' : 'text-[#6B7280]'
                    }`}
                  >
                    {s.label}
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        {/* cadena */}
        {chain.length > 0 ? (
          <div className="flex flex-col gap-px">
            {chain.map((d, i) => {
              const here = d.id === currentId
              const meta = typeMeta(d.doc_type)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => !here && onOpenDoc?.(d.id)}
                  aria-current={here ? 'true' : undefined}
                  disabled={here}
                  className={[
                    'flex items-center gap-3 px-2.5 py-2 rounded-md text-left w-full',
                    'focus-visible:outline-2 focus-visible:outline-[#FF6600] focus-visible:outline-offset-[-2px]',
                    here
                      ? 'bg-[#FF6600]/10 border border-[#FF6600]/30 cursor-default'
                      : 'border border-transparent hover:bg-[#1A1F2A]',
                  ].join(' ')}
                >
                  <span className="font-mono text-[12px] text-[#6B7280] select-none" aria-hidden>
                    {i === 0 ? '└─' : '  └─'}
                  </span>
                  <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${meta.cls}`}>
                    {meta.short}
                  </span>
                  <span
                    className={`font-mono text-[14px] font-semibold truncate ${
                      here ? 'text-[#FF6600]' : 'text-[#F0F2F5]'
                    }`}
                  >
                    {d.ref}
                  </span>
                  {d.date && <span className="text-[13px] text-[#6B7280] shrink-0">{fmtDate(d.date)}</span>}
                  {d.total != null && (
                    <span className="ml-auto font-mono text-[13px] tabular-nums text-[#9CA3AF] shrink-0">
                      {fmtAmount(d.total, d.currency)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[#6B7280] px-2 leading-relaxed">
            Todavía no derivó en otros documentos. Cuando generes el siguiente paso, la cadena aparece acá.
          </p>
        )}

        {/* historial colapsado — solo el último cambio + contador */}
        {lastEvent && (
          <details className="mt-2.5 group">
            <summary className="cursor-pointer list-none text-[13px] text-[#6B7280] px-2 py-1.5 rounded-md hover:bg-[#1A1F2A] hover:text-[#9CA3AF] focus-visible:outline-2 focus-visible:outline-[#FF6600] focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden" aria-hidden>▸ </span>
              <span className="hidden group-open:inline" aria-hidden>▾ </span>
              último cambio: {lastEvent.label} · {fmtDate(lastEvent.at)}
              {lastEvent.actor ? ` · ${lastEvent.actor}` : ''}
              {lastEvent.count > 1 ? ` · (${lastEvent.count} eventos)` : ''}
            </summary>
            <p className="pl-6 pr-2 pt-1.5 text-[11.5px] text-[#6B7280]">
              El detalle completo está en la pestaña de historial del documento.
            </p>
          </details>
        )}
      </div>

      {/* ── derecha: qué sigue ── */}
      <div className="p-5 border-t lg:border-t-0 lg:border-l border-[#1E2330] min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#6B7280] mb-3">
          Qué hacer ahora
        </p>

        {next.primary ? (
          <button
            type="button"
            onClick={() => onPrimaryAction?.(next.primary!.key)}
            disabled={next.primary.blocked}
            className="w-full text-left flex items-start gap-3 rounded-lg border border-[#FF6600]/30 bg-[#FF6600]/10 px-4 py-3.5 hover:bg-[#FF6600]/15 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#FF6600] focus-visible:outline-offset-2"
          >
            <ChevronRight size={16} className="text-[#FF6600] mt-0.5 shrink-0" aria-hidden />
            <span className="text-[15px] leading-snug text-[#F0F2F5]">
              <b className="font-semibold">{next.primary.label}</b>
              {next.primary.hint ? <> — {next.primary.hint}</> : null}
            </span>
          </button>
        ) : (
          <div className="rounded-lg border border-[#2A3040] bg-[#1A1F2A] px-4 py-3.5 text-[15px] text-[#9CA3AF]">
            {next.done ? `${next.currentLabel} — no hay nada pendiente.` : next.currentLabel}
          </div>
        )}

        {next.blockers.length > 0 && (
          <ul className="mt-2 space-y-1">
            {next.blockers.map((b, i) => (
              <li key={i} className="text-[13px] text-[#F59E0B] flex gap-1.5">
                <span aria-hidden>·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Avance — un solo gráfico en vez de una fila por producto.
            El detalle por línea ya está en la tabla de ítems más abajo;
            repetirlo acá era la tercera copia de lo mismo en la pantalla. */}
        {sum.total > 0 && (
          <div className="mt-5">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[28px] font-bold leading-none tabular-nums text-[#F0F2F5]">
                {sum.done}
              </span>
              <span className="text-[15px] text-[#9CA3AF]">de {sum.total} unidades entregadas</span>
              <span className="ml-auto text-[15px] font-semibold tabular-nums text-[#10B981]">
                {sum.pct}%
              </span>
            </div>

            <div
              className="h-2.5 rounded-full bg-[#2A3040] overflow-hidden"
              role="progressbar"
              aria-valuenow={sum.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${sum.done} de ${sum.total} unidades entregadas`}
            >
              <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${sum.pct}%` }} />
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {sum.full > 0 && (
                <span className="text-[13px] px-2.5 py-1 rounded-md bg-[#10B981]/15 text-[#10B981] font-medium">
                  {sum.full} completas
                </span>
              )}
              {sum.partial > 0 && (
                <span className="text-[13px] px-2.5 py-1 rounded-md bg-[#F59E0B]/15 text-[#F59E0B] font-medium">
                  {sum.partial} a medias
                </span>
              )}
              {sum.none > 0 && (
                <span className="text-[13px] px-2.5 py-1 rounded-md bg-[#2A3040] text-[#9CA3AF] font-medium">
                  {sum.none} sin entregar
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
