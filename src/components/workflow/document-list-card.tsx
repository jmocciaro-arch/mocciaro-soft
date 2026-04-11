'use client'

import { cn } from '@/lib/utils'
import {
  FileText, ClipboardList, Truck, CreditCard, DollarSign,
  ShoppingCart, Target, AlertCircle
} from 'lucide-react'

const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  lead: { icon: <Target size={16} />, color: '#6B7280', label: 'Lead' },
  coti: { icon: <FileText size={16} />, color: '#3B82F6', label: 'Cotizacion' },
  oc_cliente: { icon: <ClipboardList size={16} />, color: '#8B5CF6', label: 'OC Cliente' },
  pedido: { icon: <ClipboardList size={16} />, color: '#FF6600', label: 'Pedido' },
  pap: { icon: <ShoppingCart size={16} />, color: '#F59E0B', label: 'PAP' },
  recepcion: { icon: <Truck size={16} />, color: '#14B8A6', label: 'Recepcion' },
  delivery_note: { icon: <Truck size={16} />, color: '#00C853', label: 'Albaran' },
  factura: { icon: <CreditCard size={16} />, color: '#EC4899', label: 'Factura' },
  cobro: { icon: <DollarSign size={16} />, color: '#10B981', label: 'Cobro' },
  factura_compra: { icon: <CreditCard size={16} />, color: '#EF4444', label: 'Fact. compra' },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(107,114,128,0.2)', text: '#6B7280' },
  borrador: { bg: 'rgba(107,114,128,0.2)', text: '#6B7280' },
  sent: { bg: 'rgba(66,133,244,0.2)', text: '#4285F4' },
  enviada: { bg: 'rgba(66,133,244,0.2)', text: '#4285F4' },
  open: { bg: 'rgba(66,133,244,0.2)', text: '#4285F4' },
  confirmed: { bg: 'rgba(66,133,244,0.2)', text: '#4285F4' },
  in_process: { bg: 'rgba(255,102,0,0.2)', text: '#FF6600' },
  partial: { bg: 'rgba(255,179,0,0.2)', text: '#FFB300' },
  partially_delivered: { bg: 'rgba(255,179,0,0.2)', text: '#FFB300' },
  partially_invoiced: { bg: 'rgba(236,72,153,0.2)', text: '#EC4899' },
  completed: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  fully_delivered: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  received: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  delivered: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  accepted: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  aceptada: { bg: 'rgba(0,200,83,0.2)', text: '#00C853' },
  paid: { bg: 'rgba(16,185,129,0.2)', text: '#10B981' },
  cancelled: { bg: 'rgba(255,61,0,0.2)', text: '#FF3D00' },
  rejected: { bg: 'rgba(255,61,0,0.2)', text: '#FF3D00' },
  rechazada: { bg: 'rgba(255,61,0,0.2)', text: '#FF3D00' },
  closed: { bg: 'rgba(107,114,128,0.2)', text: '#6B7280' },
  pending: { bg: 'rgba(255,179,0,0.2)', text: '#FFB300' },
  invoiced: { bg: 'rgba(236,72,153,0.2)', text: '#EC4899' },
  fully_invoiced: { bg: 'rgba(236,72,153,0.2)', text: '#EC4899' },
  overdue: { bg: 'rgba(255,61,0,0.2)', text: '#FF3D00' },
}

function MiniProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-14 h-1.5 bg-[#1E2330] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  )
}

export interface DocumentListCardProps {
  type: string
  systemCode: string
  displayRef?: string
  clientName: string
  date: string
  total: number
  currency: string
  status: string
  statusLabel?: string
  deliveredPct?: number
  invoicedPct?: number
  collectedPct?: number
  alertCount?: number
  onClick: () => void
}

export function DocumentListCard({
  type,
  systemCode,
  displayRef,
  clientName,
  date,
  total,
  currency,
  status,
  statusLabel,
  deliveredPct,
  invoicedPct,
  collectedPct,
  alertCount,
  onClick,
}: DocumentListCardProps) {
  const tConfig = typeConfig[type] || { icon: <FileText size={16} />, color: '#6B7280', label: type }
  const sConfig = statusColors[status] || statusColors.draft

  const showProgress = deliveredPct !== undefined || invoicedPct !== undefined || collectedPct !== undefined

  const formattedTotal = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(total)

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-[#141820] rounded-xl border border-[#2A3040] p-4 cursor-pointer',
        'hover:border-[#FF6600]/50 hover:shadow-lg hover:shadow-[#FF6600]/5 hover:-translate-y-0.5',
        'transition-all duration-200'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Left: Type icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${tConfig.color}20`, color: tConfig.color }}
        >
          {tConfig.icon}
        </div>

        {/* Center: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono text-[#FF6600] font-semibold">
              {systemCode}
            </code>
            {displayRef && (
              <span className="text-xs text-[#6B7280] truncate">
                {displayRef}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-[#F0F2F5] truncate">
            {clientName}
          </p>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            {date}
          </p>
        </div>

        {/* Right: Total + status */}
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-[#FF6600]">{formattedTotal}</p>
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mt-1"
            style={{ background: sConfig.bg, color: sConfig.text }}
          >
            {(statusLabel || status).replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Progress bars */}
      {showProgress && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#1E2330]">
          {deliveredPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-[#6B7280] w-[52px]">Entregado</span>
              <MiniProgressBar pct={deliveredPct} color="#00C853" />
              <span className="text-[9px] font-bold text-[#00C853] w-[28px] text-right">
                {deliveredPct}%
              </span>
            </div>
          )}
          {invoicedPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-[#6B7280] w-[48px]">Facturado</span>
              <MiniProgressBar pct={invoicedPct} color="#EC4899" />
              <span className="text-[9px] font-bold text-[#EC4899] w-[28px] text-right">
                {invoicedPct}%
              </span>
            </div>
          )}
          {collectedPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-[#6B7280] w-[42px]">Cobrado</span>
              <MiniProgressBar pct={collectedPct} color="#10B981" />
              <span className="text-[9px] font-bold text-[#10B981] w-[28px] text-right">
                {collectedPct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Alert indicator */}
      {alertCount !== undefined && alertCount > 0 && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FF3D00]/20">
            <AlertCircle size={10} className="text-[#FF3D00]" />
            <span className="text-[9px] font-bold text-[#FF3D00]">{alertCount}</span>
          </div>
        </div>
      )}
    </div>
  )
}
