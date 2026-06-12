'use client'

/**
 * /catalogo/[sku] — vista de producto deep-link.
 *
 * Resuelve el SKU contra tt_products y muestra:
 *  - Imagen/diagrama + datos básicos
 *  - Specs (JSONB)
 *  - Stock por almacén (tt_stock + tt_warehouses)
 *  - Historial de compras: últimas 20 OCs con ese product_id
 *  - Historial de ventas: últimas 20 docs con ese product_id
 *  - Tarifas asignadas (tt_product_tier_prices)
 *  - CTAs: cotizar / crear OC con este producto
 *
 * NUNCA `supabase` en deps de useCallback. Crear `const sb = createClient()` adentro.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProductDetailModal } from '@/components/catalogo/product-detail-modal'
import { DocLink } from '@/components/ui/doc-link'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowLeft, Package, Loader2, AlertCircle, FileText, ShoppingCart,
  Warehouse, Tag, Image as ImageIcon, ExternalLink,
} from 'lucide-react'

interface ProductRow {
  id: string
  sku: string | null
  name: string | null
  brand: string | null
  product_type: string | null
  price_eur: number | null
  cost_eur: number | null
  image_url: string | null
  description: string | null
  company_id: string | null
  specs: Record<string, unknown> | null
}

interface StockRow {
  warehouse_id: string
  quantity: number
  warehouse_name: string | null
}

interface DocLine {
  document_id: string
  quantity: number
  unit_price: number
  document?: {
    id: string
    doc_type: string
    system_code: string
    display_ref: string | null
    status: string
    created_at: string
    total: number
    currency: string
  } | null
}

interface TierRow {
  id: string
  tier_name: string
  unit_price: number
  currency: string
  min_quantity: number
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sku = decodeURIComponent((params?.sku as string) || '')

  const [product, setProduct] = useState<ProductRow | null>(null)
  const [stock, setStock] = useState<StockRow[]>([])
  const [salesLines, setSalesLines] = useState<DocLine[]>([])
  const [purchaseLines, setPurchaseLines] = useState<DocLine[]>([])
  const [tiers, setTiers] = useState<TierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    const sb = createClient()

    // 1) Producto por SKU
    const { data: prod, error: prodErr } = await sb
      .from('tt_products')
      .select('id, sku, name, brand, product_type, price_eur, cost_eur, image_url, description, company_id, specs')
      .eq('sku', sku)
      .maybeSingle()

    if (prodErr || !prod) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setProduct(prod as ProductRow)
    const productId = (prod as ProductRow).id

    // 2) En paralelo: stock, ventas, compras, tarifas
    const [stockRes, salesRes, purchasesRes, tiersRes] = await Promise.all([
      sb
        .from('tt_stock')
        .select('warehouse_id, quantity, tt_warehouses(name)')
        .eq('product_id', productId),
      sb
        .from('tt_document_lines')
        .select('document_id, quantity, unit_price, tt_documents!inner(id, doc_type, system_code, display_ref, status, created_at, total, currency)')
        .eq('product_id', productId)
        .in('tt_documents.doc_type', ['presupuesto', 'pedido', 'albaran', 'factura', 'quote', 'order', 'delivery_note', 'invoice'])
        .order('created_at', { foreignTable: 'tt_documents', ascending: false })
        .limit(20),
      sb
        .from('tt_document_lines')
        .select('document_id, quantity, unit_price, tt_documents!inner(id, doc_type, system_code, display_ref, status, created_at, total, currency)')
        .eq('product_id', productId)
        .in('tt_documents.doc_type', ['pap', 'factura_compra', 'purchase_order', 'po'])
        .order('created_at', { foreignTable: 'tt_documents', ascending: false })
        .limit(20),
      sb
        .from('tt_product_tier_prices')
        .select('id, tier_name, unit_price, currency, min_quantity')
        .eq('product_id', productId)
        .order('min_quantity', { ascending: true }),
    ])

    setStock(
      ((stockRes.data || []) as Array<Record<string, unknown>>).map(s => ({
        warehouse_id: s.warehouse_id as string,
        quantity: Number(s.quantity) || 0,
        warehouse_name: ((s.tt_warehouses as { name?: string } | null) || null)?.name || null,
      }))
    )

    const mapDoc = (rows: unknown[]) => (rows as Array<Record<string, unknown>>).map(r => ({
      document_id: r.document_id as string,
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      document: (r.tt_documents as DocLine['document']) || null,
    }))
    setSalesLines(mapDoc(salesRes.data || []))
    setPurchaseLines(mapDoc(purchasesRes.data || []))
    setTiers((tiersRes.data || []) as TierRow[])

    setLoading(false)
  }, [sku])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="text-red-500" size={48} />
        <h1 className="text-xl font-bold text-[#F0F2F5]">Producto no encontrado</h1>
        <p className="text-sm text-[#9CA3AF]">No existe ningún producto con SKU <span className="font-mono">{sku}</span>.</p>
        <Link href="/catalogo">
          <Button variant="primary">Volver al catálogo</Button>
        </Link>
      </div>
    )
  }

  if (loading || !product) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-[#9CA3AF]">
        <Loader2 size={16} className="animate-spin text-[#FF6600]" />
        Cargando producto…
      </div>
    )
  }

  const skuEnc = encodeURIComponent(product.sku || '')

  return (
    <div className="px-3 sm:px-5 py-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#F0F2F5]"
        >
          <ArrowLeft size={16} />
          Volver al catálogo
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/cotizador?products=${skuEnc}`)}
          >
            <FileText size={14} className="mr-1" />
            Cotizar este producto
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/compras?tab=pedidos&newWith=${skuEnc}`)}
          >
            <ShoppingCart size={14} className="mr-1" />
            Crear OC
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetailModal(true)}
          >
            <ExternalLink size={14} className="mr-1" />
            Detalle completo
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-24 h-24 rounded-xl bg-[#0F1218] border border-[#1E2330] flex items-center justify-center shrink-0">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name || product.sku || 'Producto'}
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <ImageIcon size={32} className="text-[#3A4252]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {product.sku && <Badge variant="default">SKU: {product.sku}</Badge>}
              {product.brand && <Badge variant="info">{product.brand}</Badge>}
              {product.product_type && <Badge variant="default">{product.product_type}</Badge>}
            </div>
            <h1 className="text-lg font-bold text-[#F0F2F5]">{product.name || 'Producto sin nombre'}</h1>
            {product.description && (
              <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-2">{product.description}</p>
            )}
            <div className="flex gap-4 mt-3">
              <div>
                <p className="text-[10px] text-[#6B7280] uppercase">Precio</p>
                <p className="text-sm font-bold text-[#FF6600]">
                  {product.price_eur ? formatCurrency(product.price_eur, 'EUR') : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#6B7280] uppercase">Costo</p>
                <p className="text-sm font-semibold text-[#F0F2F5]">
                  {product.cost_eur ? formatCurrency(product.cost_eur, 'EUR') : '—'}
                </p>
              </div>
              {product.price_eur && product.cost_eur && product.cost_eur > 0 && (
                <div>
                  <p className="text-[10px] text-[#6B7280] uppercase">Margen</p>
                  <p className="text-sm font-semibold text-emerald-400">
                    {((product.price_eur - product.cost_eur) / product.price_eur * 100).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Warehouse size={14} className="text-[#FF6600]" />
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Stock por almacén</h3>
          </div>
          {stock.length === 0 ? (
            <p className="text-xs text-[#4B5563]">Sin stock registrado.</p>
          ) : (
            <div className="space-y-2">
              {stock.map(s => (
                <div key={s.warehouse_id} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                  <span className="text-xs text-[#F0F2F5]">{s.warehouse_name || s.warehouse_id.slice(0, 8)}</span>
                  <span className={`text-sm font-bold ${s.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {s.quantity}
                  </span>
                </div>
              ))}
              <div className="border-t border-[#1E2330] pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3AF]">Total</span>
                <span className="text-sm font-bold text-[#F0F2F5]">
                  {stock.reduce((s, r) => s + r.quantity, 0)}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Tarifas */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={14} className="text-[#FF6600]" />
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Tarifas asignadas</h3>
          </div>
          {tiers.length === 0 ? (
            <p className="text-xs text-[#4B5563]">Sin tarifas configuradas.</p>
          ) : (
            <div className="space-y-2">
              {tiers.map(t => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0F1218]">
                  <div>
                    <p className="text-xs text-[#F0F2F5]">{t.tier_name}</p>
                    <p className="text-[10px] text-[#6B7280]">Mín: {t.min_quantity}</p>
                  </div>
                  <span className="text-sm font-bold text-[#FF6600]">
                    {formatCurrency(t.unit_price, (t.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Specs */}
        {product.specs && Object.keys(product.specs).length > 0 && (
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-[#FF6600]" />
              <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Especificaciones técnicas</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(product.specs).map(([k, v]) => (
                <div key={k} className="p-2 rounded-lg bg-[#0F1218]">
                  <p className="text-[10px] text-[#6B7280] uppercase">{k}</p>
                  <p className="text-xs text-[#F0F2F5]">{String(v)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Historial ventas */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-[#FF6600]" />
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Últimas 20 ventas</h3>
          </div>
          <LineList lines={salesLines} onClick={(id) => router.push(`/documentos/${id}`)} />
        </Card>

        {/* Historial compras */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart size={14} className="text-[#FF6600]" />
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase">Últimas 20 compras</h3>
          </div>
          <LineList lines={purchaseLines} onClick={(id) => router.push(`/documentos/${id}`)} />
        </Card>
      </div>

      {/* Modal completo del producto (reusa el existente) */}
      {showDetailModal && (
        <ProductDetailModal
          productId={product.id}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  )
}

function LineList({ lines, onClick }: { lines: DocLine[]; onClick: (id: string) => void }) {
  if (lines.length === 0) {
    return <p className="text-xs text-[#4B5563]">Sin movimientos.</p>
  }
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {lines.map(l => {
        if (!l.document) return null
        const d = l.document
        return (
          <button
            key={`${l.document_id}-${d.id}`}
            onClick={() => onClick(d.id)}
            className="w-full flex items-center justify-between gap-3 p-2 rounded-lg bg-[#0F1218] hover:bg-[#141820] transition-colors text-left"
          >
            <div className="min-w-0 flex-1">
              <DocLink
                docRef={(d.display_ref || d.system_code) as string}
                docId={d.id}
                docType={d.doc_type}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-[#6B7280] mt-0.5">
                {formatDate(d.created_at)} · {l.quantity} × {formatCurrency(l.unit_price, (d.currency || 'EUR') as 'EUR' | 'USD' | 'ARS')}
              </p>
            </div>
            <Badge variant="default">{d.status}</Badge>
          </button>
        )
      })}
    </div>
  )
}
