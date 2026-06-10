'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { EnabledChannel } from '@/lib/channels/gate'

interface ProductHit {
  id: string
  sku: string
  name: string
}

interface NewListingModalProps {
  isOpen: boolean
  onClose: () => void
  channels: EnabledChannel[]
  companyId: string | null
  defaultCurrency: string
  onCreated: () => void
}

const INPUT_CLS = 'w-full bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder-[#6B7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]'
const LABEL_CLS = 'block text-[11px] uppercase tracking-wider font-bold text-[#6B7280] mb-1'

/**
 * Alta manual de publicación (spec §3.3 — requiere permiso publish_listings,
 * lo controla la página). tt_channel_listings.product_id es NOT NULL: la
 * publicación siempre nace vinculada a un producto del catálogo.
 * Se crea en estado 'draft'; la sync real con el marketplace es fase posterior.
 */
export function NewListingModal({ isOpen, onClose, channels, companyId, defaultCurrency, onCreated }: NewListingModalProps) {
  const { addToast } = useToast()
  const [channelId, setChannelId] = useState('')
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<ProductHit[]>([])
  const [searching, setSearching] = useState(false)
  const [product, setProduct] = useState<ProductHit | null>(null)
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [stock, setStock] = useState('0')
  const [saving, setSaving] = useState(false)

  async function searchProducts() {
    const term = search.trim()
    if (term.length < 2) {
      addToast({ type: 'warning', title: 'Escribí al menos 2 caracteres para buscar' })
      return
    }
    setSearching(true)
    const sb = createClient()
    const { data, error } = await sb
      .from('tt_products')
      .select('id, sku, name')
      .or(`sku.ilike.%${term}%,name.ilike.%${term}%`)
      .limit(8)
    setSearching(false)
    if (error) {
      addToast({ type: 'error', title: 'Error buscando productos', message: error.message })
      return
    }
    setHits((data ?? []) as ProductHit[])
  }

  function pickProduct(hit: ProductHit) {
    setProduct(hit)
    setHits([])
    setSearch(`${hit.sku} — ${hit.name}`)
    if (!title) setTitle(hit.name)
  }

  async function save() {
    if (!companyId) return
    if (!channelId) { addToast({ type: 'warning', title: 'Elegí un canal' }); return }
    if (!product) { addToast({ type: 'warning', title: 'Elegí un producto del catálogo' }); return }
    if (!title.trim()) { addToast({ type: 'warning', title: 'Ingresá un título' }); return }
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum <= 0) { addToast({ type: 'warning', title: 'Ingresá un precio válido' }); return }
    const stockNum = Number(stock)
    if (!Number.isInteger(stockNum) || stockNum < 0) { addToast({ type: 'warning', title: 'Stock publicado inválido' }); return }

    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('tt_channel_listings').insert({
      company_id: companyId,
      channel_id: channelId,
      product_id: product.id,
      title: title.trim(),
      price: priceNum,
      currency,
      stock_published: stockNum,
      status: 'draft',
    })
    setSaving(false)
    if (error) {
      addToast({ type: 'error', title: 'No se pudo crear la publicación', message: error.message })
      return
    }
    addToast({ type: 'success', title: 'Publicación creada en borrador', message: 'La sync con el marketplace llega en la fase siguiente.' })
    onCreated()
    handleClose()
  }

  function handleClose() {
    setChannelId(''); setSearch(''); setHits([]); setProduct(null)
    setTitle(''); setPrice(''); setStock('0'); setCurrency(defaultCurrency)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nueva publicación" size="md">
      <div className="space-y-3">
        <div>
          <label htmlFor="nl-canal" className={LABEL_CLS}>Canal</label>
          <select id="nl-canal" className={INPUT_CLS} value={channelId} onChange={e => setChannelId(e.target.value)}>
            <option value="">Elegí un canal…</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="nl-prod" className={LABEL_CLS}>Producto del catálogo</label>
          <div className="flex gap-2">
            <input
              id="nl-prod"
              className={INPUT_CLS}
              placeholder="Buscar por SKU o nombre…"
              value={search}
              onChange={e => { setSearch(e.target.value); setProduct(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void searchProducts() } }}
            />
            <Button variant="secondary" onClick={searchProducts} disabled={searching}>
              {searching ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          {hits.length > 0 && (
            <ul className="mt-1 border border-[#2A3040] rounded-lg overflow-hidden divide-y divide-[#1E2330]">
              {hits.map(hit => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => pickProduct(hit)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#1E2330] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF6600]"
                  >
                    <span className="font-mono text-[12px] text-[#9CA3AF] mr-2">{hit.sku}</span>
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="nl-title" className={LABEL_CLS}>Título de la publicación</label>
          <input id="nl-title" className={INPUT_CLS} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="nl-price" className={LABEL_CLS}>Precio</label>
            <input id="nl-price" type="number" min="0" step="0.01" className={INPUT_CLS} value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <label htmlFor="nl-cur" className={LABEL_CLS}>Moneda</label>
            <select id="nl-cur" className={INPUT_CLS} value={currency} onChange={e => setCurrency(e.target.value)}>
              {['EUR', 'USD', 'ARS'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="nl-stock" className={LABEL_CLS}>Stock publicado</label>
            <input id="nl-stock" type="number" min="0" step="1" className={INPUT_CLS} value={stock} onChange={e => setStock(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Creando…' : 'Crear publicación'}</Button>
        </div>
      </div>
    </Modal>
  )
}
