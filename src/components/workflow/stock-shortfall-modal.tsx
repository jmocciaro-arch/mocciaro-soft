'use client'

/**
 * StockShortfallModal — FASE 1.1
 *
 * Modal de advertencia previo a emitir un REM cuando algún producto
 * no tiene stock físico suficiente. Da tres opciones:
 *
 *   [Cancelar]                    — cierra, no emite REM
 *   [No emitir el ítem faltante]  — emite REM solo con productos disponibles
 *   [Emitir igual (con motivo)]   — overdelivery, requiere permiso
 *                                   allow_overdelivery + texto de motivo
 *
 * El permiso se verifica antes de mostrar el botón "Emitir igual".
 */

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { AlertTriangle, X } from 'lucide-react'
import type { StockShortfall } from '@/lib/stock-ops'

export interface StockShortfallDecision {
  /** Acción elegida por el usuario */
  action: 'cancel' | 'partial' | 'overdeliver'
  /** Si action='overdeliver', motivo escrito */
  reason?: string
}

export interface StockShortfallModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Lista de productos con stock insuficiente y cantidad disponible
   * real en el warehouse default de la empresa.
   */
  shortfalls: StockShortfall[]
  /**
   * Si el usuario actual tiene permiso allow_overdelivery, mostrar
   * el botón "Emitir igual". Si no, solo "Cancelar" o "Sólo lo disponible".
   */
  canOverdeliver: boolean
  onDecision: (decision: StockShortfallDecision) => void | Promise<void>
  processing?: boolean
}

export function StockShortfallModal({
  isOpen,
  onClose,
  shortfalls,
  canOverdeliver,
  onDecision,
  processing = false,
}: StockShortfallModalProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  function handleOverdeliver() {
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setReasonError('Indicá el motivo (mínimo 3 caracteres). Queda en la trazabilidad del REM.')
      return
    }
    setReasonError('')
    void onDecision({ action: 'overdeliver', reason: trimmed })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stock insuficiente" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-lg">
          <AlertTriangle size={20} className="text-[#F59E0B] mt-0.5 shrink-0" />
          <div className="text-sm text-[#F0F2F5]">
            Hay {shortfalls.length} producto(s) sin stock físico suficiente para el remito.
            {!canOverdeliver && (
              <div className="text-xs text-[#9CA3AF] mt-1">
                Tu rol no tiene permiso <code className="bg-[#1E2330] px-1 py-0.5 rounded">allow_overdelivery</code>.
                Sólo podés emitir el remito con lo disponible, o cancelar.
              </div>
            )}
          </div>
        </div>

        {/* Tabla de faltantes */}
        <div className="border border-[#2A3040] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#1C2230] text-[#9CA3AF]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-left font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Pedido</th>
                <th className="px-3 py-2 text-right font-medium">Disponible</th>
                <th className="px-3 py-2 text-right font-medium">Faltante</th>
              </tr>
            </thead>
            <tbody className="text-[#F0F2F5]">
              {shortfalls.map((s) => (
                <tr key={s.product_id} className="border-t border-[#2A3040]">
                  <td className="px-3 py-2 font-mono text-[#9CA3AF]">{s.sku || '-'}</td>
                  <td className="px-3 py-2">{s.description || '-'}</td>
                  <td className="px-3 py-2 text-right">{s.requested}</td>
                  <td className="px-3 py-2 text-right text-[#10B981]">{s.on_hand}</td>
                  <td className="px-3 py-2 text-right text-[#EF4444] font-semibold">{s.shortfall}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shortfalls[0]?.warehouse_code && (
            <div className="bg-[#1C2230] px-3 py-1.5 text-[10px] text-[#6B7280] border-t border-[#2A3040]">
              Almacén: {shortfalls[0].warehouse_code}
            </div>
          )}
        </div>

        {/* Sólo si puede overdeliver, mostrar input motivo */}
        {canOverdeliver && (
          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 uppercase tracking-wider">
              Motivo de sobreentrega (obligatorio)
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError('') }}
              rows={2}
              placeholder='Ej: "Adelantamos entrega con stock de Pompeya, faltante llega mañana"'
              className="w-full bg-[#0B0E13] border border-[#2A3040] rounded-lg p-2 text-sm text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-y"
            />
            {reasonError && (
              <div className="text-xs text-[#EF4444] mt-1">{reasonError}</div>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
            disabled={processing}
            className="flex-1"
          >
            <X size={14} /> Cancelar
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => onDecision({ action: 'partial' })}
            disabled={processing}
            className="flex-1"
          >
            Sólo lo disponible
          </Button>

          {canOverdeliver && (
            <Button
              variant="primary"
              size="md"
              onClick={handleOverdeliver}
              loading={processing}
              disabled={processing}
              className="!bg-[#F59E0B] hover:!bg-[#D97706] flex-1"
            >
              <AlertTriangle size={14} /> Emitir igual
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
