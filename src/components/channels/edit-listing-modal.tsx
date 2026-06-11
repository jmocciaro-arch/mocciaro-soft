'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle } from 'lucide-react'

/** Mínimo que el modal necesita de una fila de publicación de ML. */
export interface EditableListing {
  id: string
  title: string | null
  price: number | null
  currency: string | null
  stock_published: number | null
  status: string
}

interface EditListingModalProps {
  listing: EditableListing | null
  onClose: () => void
  onSaved: () => void
}

const INPUT_CLS = 'w-full bg-[#0F1218] border border-[#2A3040] rounded-lg px-3 py-2 text-sm text-[#F0F2F5] placeholder-[#6B7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6600]'
const LABEL_CLS = 'block text-[11px] uppercase tracking-wider font-bold text-[#6B7280] mb-1'

/**
 * Edita una publicación de ML. OJO: cada cambio se escribe EN VIVO en
 * MercadoLibre (precio/stock que ven los compradores) vía PATCH
 * /api/channels/listings/:id. Por eso el banner de advertencia y el botón
 * "Guardar en MercadoLibre" en vez de un "Guardar" genérico.
 */
export function EditListingModal({ listing, onClose, onSaved }: EditListingModalProps) {
  const { addToast } = useToast()
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [paused, setPaused] = useState(false)
  const [saving, setSaving] = useState(false)

  // Re-hidratar el form cada vez que cambia la publicación seleccionada.
  useEffect(() => {
    if (!listing) return
    setTitle(listing.title ?? '')
    setPrice(listing.price != null ? String(listing.price) : '')
    setStock(listing.stock_published != null ? String(listing.stock_published) : '')
    setPaused(listing.status === 'paused')
  }, [listing])

  async function save() {
    if (!listing) return
    const patch: Record<string, unknown> = {}

    const t = title.trim()
    if (t && t !== (listing.title ?? '')) patch.title = t

    if (price !== '') {
      const p = Number(price)
      if (!Number.isFinite(p) || p < 0) { addToast({ type: 'warning', title: 'Precio inválido' }); return }
      if (p !== listing.price) patch.price = p
    }

    if (stock !== '') {
      const s = Number(stock)
      if (!Number.isInteger(s) || s < 0) { addToast({ type: 'warning', title: 'Stock inválido' }); return }
      if (s !== listing.stock_published) patch.stock = s
    }

    const wantStatus = paused ? 'paused' : 'active'
    if (wantStatus !== listing.status && (listing.status === 'active' || listing.status === 'paused')) {
      patch.status = wantStatus
    }

    if (Object.keys(patch).length === 0) {
      addToast({ type: 'info', title: 'No cambiaste nada' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/channels/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      // El server puede devolver HTML en un crash (500): leer texto y parsear con cuidado.
      const text = await res.text()
      let parsed: { error?: string } = {}
      try { parsed = text ? JSON.parse(text) as { error?: string } : {} } catch { /* respuesta no-JSON */ }
      if (!res.ok) {
        addToast({ type: 'error', title: 'No se pudo guardar en MercadoLibre', message: parsed.error ?? `Error ${res.status}` })
        return
      }
      addToast({ type: 'success', title: 'Publicación actualizada en MercadoLibre' })
      onSaved()
      onClose()
    } catch (e) {
      // fetch rechazado (red caída/offline): sin esto quedaba como unhandled rejection silenciosa.
      addToast({ type: 'error', title: 'No se pudo conectar', message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={listing !== null} onClose={onClose} title="Editar publicación" size="md">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-[#FF6600]/40 bg-[#FF6600]/10 px-3 py-2 text-[12px] text-[#F0F2F5]">
          <AlertTriangle size={15} className="text-[#FF6600] shrink-0 mt-0.5" />
          <span>Los cambios se aplican <strong>en vivo en MercadoLibre</strong>: el precio y el stock los ven los compradores al instante.</span>
        </div>

        <div>
          <label htmlFor="el-title" className={LABEL_CLS}>Título</label>
          <input id="el-title" className={INPUT_CLS} value={title} onChange={e => setTitle(e.target.value)} maxLength={180} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="el-price" className={LABEL_CLS}>Precio {listing?.currency ? `(${listing.currency})` : ''}</label>
            <input id="el-price" type="number" min="0" step="0.01" className={INPUT_CLS} value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <label htmlFor="el-stock" className={LABEL_CLS}>Stock publicado</label>
            <input id="el-stock" type="number" min="0" step="1" className={INPUT_CLS} value={stock} onChange={e => setStock(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} className="accent-[#FF6600] w-4 h-4" />
          Pausar la publicación (no visible para compradores)
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar en MercadoLibre'}</Button>
        </div>
      </div>
    </Modal>
  )
}
