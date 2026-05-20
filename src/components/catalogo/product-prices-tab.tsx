'use client'

/**
 * ProductPricesTab
 * Muestra una fila de precios (compra / venta / mínimo / moneda)
 * por cada empresa disponible.  El padre maneja el estado; este
 * componente solo renderiza y llama `onChange`.
 *
 * Estilo: StelOrder light (fondo blanco, borde gris claro, focus naranja).
 */

import { DollarSign, TrendingUp, TrendingDown, Info } from 'lucide-react'

const COUNTRY_FLAGS: Record<string, string> = {
  AR: '🇦🇷', ES: '🇪🇸', US: '🇺🇸',
  UY: '🇺🇾', CL: '🇨🇱', BR: '🇧🇷', MX: '🇲🇽',
}

export interface CompanyPriceRow {
  company_id:    string
  currency_code: string
  purchase_price: number | null
  sale_price:     number | null
  min_price:      number | null
}

interface CompanyMeta {
  id:       string
  name:     string
  currency: string
  country:  string
}

interface Props {
  companies: CompanyMeta[]
  prices:    Record<string, CompanyPriceRow>
  onChange:  (companyId: string, field: keyof CompanyPriceRow, value: string | number | null) => void
}

function numOrNull(v: string): number | null {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function margin(sale: number | null, purchase: number | null): string | null {
  if (!sale || !purchase || purchase === 0) return null
  const pct = ((sale - purchase) / sale) * 100
  return pct.toFixed(1)
}

// Inputs StelOrder-style: fondo blanco, borde gris claro, focus naranja.
const INPUT_BASE =
  'w-full h-9 rounded-md bg-white border border-[#E5E5E5] text-sm text-[#1F2937] placeholder:text-[#9CA3AF] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#FF6600]/30 focus:border-[#FF6600] transition-colors'

export function ProductPricesTab({ companies, prices, onChange }: Props) {
  if (companies.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-md bg-[#F9FAFB] border border-[#E5E5E5] text-sm text-[#6B7280]">
        <Info size={16} />
        No hay empresas configuradas.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#6B7280] flex items-center gap-1.5">
        <Info size={12} />
        Cargá precios por empresa. La moneda se autocompletá según la empresa pero podés cambiarla.
      </p>

      {/* Cabecera de columnas */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_80px_1fr_1fr_1fr_60px] gap-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        <span>Empresa</span>
        <span>Moneda</span>
        <span>Precio compra</span>
        <span>Precio venta</span>
        <span>Precio mínimo</span>
        <span className="text-right">Margen</span>
      </div>

      {companies.map((c) => {
        const row = prices[c.id] ?? {
          company_id:    c.id,
          currency_code: c.currency || 'USD',
          purchase_price: null,
          sale_price:    null,
          min_price:     null,
        }
        const mgn = margin(row.sale_price, row.purchase_price)
        const mgmPositive = mgn !== null && parseFloat(mgn) > 0
        const flag = COUNTRY_FLAGS[c.country] ?? '🏢'

        return (
          <div
            key={c.id}
            className="rounded-md border border-[#E5E5E5] bg-white p-3 space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[1fr_80px_1fr_1fr_1fr_60px] sm:gap-2 sm:items-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          >
            {/* Nombre empresa */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">{flag}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1F2937] truncate">{c.name}</p>
              </div>
            </div>

            {/* Moneda */}
            <div>
              <label className="sm:hidden block text-[10px] text-[#6B7280] mb-1">Moneda</label>
              <input
                type="text"
                maxLength={3}
                value={row.currency_code}
                onChange={(e) => onChange(c.id, 'currency_code', e.target.value.toUpperCase())}
                className={`${INPUT_BASE} px-2 text-center font-mono uppercase`}
              />
            </div>

            {/* Precio compra */}
            <div>
              <label className="sm:hidden block text-[10px] text-[#6B7280] mb-1">Precio compra</label>
              <div className="relative">
                <TrendingDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#3B82F6] pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.purchase_price ?? ''}
                  placeholder="0.00"
                  onChange={(e) => onChange(c.id, 'purchase_price', numOrNull(e.target.value))}
                  className={`${INPUT_BASE} pl-6 pr-2`}
                />
              </div>
            </div>

            {/* Precio venta */}
            <div>
              <label className="sm:hidden block text-[10px] text-[#6B7280] mb-1">Precio venta</label>
              <div className="relative">
                <TrendingUp size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#FF6600] pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.sale_price ?? ''}
                  placeholder="0.00"
                  onChange={(e) => onChange(c.id, 'sale_price', numOrNull(e.target.value))}
                  className={`${INPUT_BASE} pl-6 pr-2`}
                />
              </div>
            </div>

            {/* Precio mínimo */}
            <div>
              <label className="sm:hidden block text-[10px] text-[#6B7280] mb-1">Precio mínimo</label>
              <div className="relative">
                <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#10B981] pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.min_price ?? ''}
                  placeholder="0.00"
                  onChange={(e) => onChange(c.id, 'min_price', numOrNull(e.target.value))}
                  className={`${INPUT_BASE} pl-6 pr-2`}
                />
              </div>
            </div>

            {/* Margen calculado */}
            <div className="sm:text-right">
              <label className="sm:hidden block text-[10px] text-[#6B7280] mb-1">Margen</label>
              {mgn !== null ? (
                <span className={`text-sm font-bold ${mgmPositive ? 'text-[#10B981]' : 'text-[#DC2626]'}`}>
                  {mgn}%
                </span>
              ) : (
                <span className="text-xs text-[#9CA3AF]">—</span>
              )}
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-[#9CA3AF] pt-2">
        El margen se calcula sobre precio de venta: (venta – compra) / venta × 100
      </p>
    </div>
  )
}
