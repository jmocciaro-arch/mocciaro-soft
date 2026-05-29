'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown, MoreHorizontal, Package, AlertCircle } from 'lucide-react'

export interface DocumentItem {
  id: string
  sku: string
  description: string
  quantity: number
  unit_price: number
  subtotal: number
  qty_delivered: number
  qty_invoiced: number
  qty_reserved: number
  status: string
  statusColor: string
  statusLabel: string
  stockAvailable: number
  stockReserved: number
  stockIndicator: 'ok' | 'low' | 'critical' | 'ordered'
  requires_po: boolean
  po_status?: string
  notes?: string
  hasComponents: boolean
  // Referencias originales del cliente cuando esta línea proviene de una OC.
  // Persistidas en tt_document_lines.metadata.{client_sku, client_description}.
  // Si existen, se muestran como subfila gris debajo del SKU/descripción del catálogo.
  client_sku?: string
  client_description?: string
}

export interface DocumentItemComponent {
  id: string
  parent_item_id: string
  sku: string
  description: string
  quantity: number
  unit_cost: number
  status: string
  statusLabel: string
  statusColor: string
  stockAvailable: number
  stockIndicator: 'ok' | 'low' | 'critical' | 'ordered'
}

interface DocumentItemsTreeProps {
  items: DocumentItem[]
  components: DocumentItemComponent[]
  showStock?: boolean
  onItemAction?: (itemId: string, action: string) => void
}

const stockColors = {
  ok: '#00C853',
  low: '#FFB300',
  critical: '#FF3D00',
  ordered: '#4285F4',
}

function StockBar({ available, reserved, indicator }: { available: number; reserved: number; indicator: string }) {
  const color = stockColors[indicator as keyof typeof stockColors] || '#6B7280'
  const maxVal = Math.max(available + reserved, 1)
  const availPct = (available / maxVal) * 100
  const reservedPct = (reserved / maxVal) * 100

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-[#1E2330] rounded-full overflow-hidden flex">
        <div
          className="h-full rounded-l-full transition-all"
          style={{ width: `${availPct}%`, background: color }}
        />
        {reserved > 0 && (
          <div
            className="h-full transition-all"
            style={{ width: `${reservedPct}%`, background: '#4285F4', opacity: 0.6 }}
          />
        )}
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>
        {available}
      </span>
    </div>
  )
}

function ItemRow({
  item,
  components,
  showStock,
  onItemAction,
}: {
  item: DocumentItem
  components: DocumentItemComponent[]
  showStock?: boolean
  onItemAction?: (itemId: string, action: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const itemComponents = components.filter((c) => c.parent_item_id === item.id)

  return (
    <div className="group">
      {/* Main item row */}
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 hover:bg-[#1C2230] transition-colors rounded-lg cursor-pointer',
          expanded && 'bg-[#1C2230]/50'
        )}
        onClick={() => item.hasComponents && setExpanded(!expanded)}
      >
        {/* Expand toggle */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {item.hasComponents ? (
            expanded ? (
              <ChevronDown size={14} className="text-[#FF6600]" />
            ) : (
              <ChevronRight size={14} className="text-[#6B7280]" />
            )
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-[#2A3040]" />
          )}
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#F0F2F5] truncate">
              {item.description}
            </span>
            {item.requires_po && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-[#F59E0B]/20 text-[#F59E0B]">
                PAP
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#6B7280] font-mono">{item.sku}</span>
          {/* Render dual: ref cliente debajo si existe y difiere del SKU/desc principal.
              Se muestra como subfila gris pequeña con el flechita ↳ — consistente
              con el render del cotizador. */}
          {(item.client_sku && item.client_sku !== item.sku) || (item.client_description && item.client_description !== item.description) ? (
            <div className="text-[10px] text-[#4B5563] mt-0.5 truncate" title={`Ref. cliente: ${item.client_sku || ''} ${item.client_description || ''}`.trim()}>
              {'↳ '}
              {item.client_sku && item.client_sku !== item.sku && <span className="font-mono">{item.client_sku}</span>}
              {item.client_sku && item.client_description && item.client_sku !== item.sku && item.client_description !== item.description && <span> · </span>}
              {item.client_description && item.client_description !== item.description && <span>{item.client_description}</span>}
            </div>
          ) : null}
        </div>

        {/* Quantity */}
        <div className="text-right w-12 shrink-0">
          <span className="text-xs font-bold text-[#F0F2F5]">{item.quantity}</span>
          <span className="text-[10px] text-[#6B7280]">x</span>
        </div>

        {/* Status badge */}
        <div className="w-[120px] shrink-0">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: `${item.statusColor}20`, color: item.statusColor }}
          >
            {item.statusLabel}
          </span>
        </div>

        {/* Delivery progress */}
        <div className="w-20 shrink-0 text-right">
          <span className="text-[10px]">
            <span className="text-[#00C853] font-bold">{item.qty_delivered}</span>
            <span className="text-[#6B7280]">/{item.quantity}</span>
          </span>
          {item.qty_delivered < item.quantity && (
            <p className="text-[9px] text-[#FFB300]">
              pend: {item.quantity - item.qty_delivered}
            </p>
          )}
        </div>

        {/* Stock indicator */}
        {showStock && (
          <div className="w-20 shrink-0">
            <StockBar
              available={item.stockAvailable}
              reserved={item.stockReserved}
              indicator={item.stockIndicator}
            />
          </div>
        )}

        {/* Actions menu */}
        <div className="w-6 shrink-0 relative">
          <button
            className="p-1 rounded hover:bg-[#2A3040] text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-[#1C2230] border border-[#2A3040] rounded-lg shadow-xl py-1 min-w-[140px]">
              {['Preparar', 'Entregar', 'Facturar', 'Ver stock', 'Cancelar'].map((action) => (
                <button
                  key={action}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#9CA3AF] hover:text-[#F0F2F5] hover:bg-[#2A3040] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onItemAction?.(item.id, action.toLowerCase())
                    setMenuOpen(false)
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded components */}
      {expanded && itemComponents.length > 0 && (
        <div className="ml-8 border-l-2 border-[#2A3040] pl-3 py-1 space-y-1 animate-slide-up">
          {itemComponents.map((comp) => (
            <div
              key={comp.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1C2230] transition-colors"
            >
              <span className="text-[#6B7280] text-xs">\u21B3</span>
              <Package size={12} className="text-[#6B7280] shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-[#9CA3AF] truncate block">
                  {comp.description}
                </span>
                <span className="text-[10px] text-[#6B7280] font-mono">{comp.sku}</span>
              </div>
              <span className="text-xs text-[#9CA3AF] w-12 text-right shrink-0">
                {comp.quantity}x
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold w-[120px] text-center shrink-0"
                style={{ background: `${comp.statusColor}20`, color: comp.statusColor }}
              >
                {comp.statusLabel}
              </span>
              {showStock && (
                <div className="w-20 shrink-0">
                  <StockBar
                    available={comp.stockAvailable}
                    reserved={0}
                    indicator={comp.stockIndicator}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DocumentItemsTree({
  items,
  components,
  showStock = true,
  onItemAction,
}: DocumentItemsTreeProps) {
  return (
    <div className="bg-[#141820] rounded-xl border border-[#2A3040] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A3040]">
        <h3 className="text-xs font-bold text-[#F0F2F5] uppercase tracking-wide">
          Items del documento
        </h3>
        <span className="text-[10px] text-[#6B7280]">{items.length} lineas</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-[#6B7280] uppercase tracking-wider border-b border-[#1E2330]">
        <div className="w-5 shrink-0" />
        <div className="flex-1">Producto</div>
        <div className="w-12 text-right shrink-0">Cant</div>
        <div className="w-[120px] shrink-0">Estado</div>
        <div className="w-20 text-right shrink-0">Entregado</div>
        {showStock && <div className="w-20 shrink-0">Stock</div>}
        <div className="w-6 shrink-0" />
      </div>

      {/* Items */}
      <div className="divide-y divide-[#1E2330]/50 px-1 py-1">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            components={components}
            showStock={showStock}
            onItemAction={onItemAction}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#2A3040] bg-[#0B0E13]/50">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#6B7280]">
            {items.filter((i) => i.qty_delivered >= i.quantity).length}/{items.length} items completos
          </span>
          {items.some((i) => i.stockIndicator === 'critical') && (
            <span className="flex items-center gap-1 text-[#FF3D00]">
              <AlertCircle size={10} />
              Items sin stock
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
