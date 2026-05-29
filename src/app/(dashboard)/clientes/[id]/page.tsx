'use client'

/**
 * Página de detalle de cliente
 *
 * Carga los datos básicos del cliente y monta el panel del Glosario SKU
 * (mapeo aliases SKU cliente → producto del catálogo) que va aprendiendo
 * automáticamente cada vez que se importa una OC del cliente y se vinculan
 * productos.
 *
 * Hoy es una página mínima con sólo el glosario. Más adelante se puede
 * extender con tabs: Datos · Glosario · Contactos · Historial · Cotizaciones.
 */

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkuGlossary } from '@/components/clientes/sku-glossary'
import { ArrowLeft, Building2, Mail, Phone, MapPin, AlertCircle } from 'lucide-react'
import { clientCompanyName, clientLikelyContactName } from '@/lib/document-contacts'

interface ClientRow {
  id: string
  name: string | null
  legal_name: string | null
  trade_name: string | null
  tax_id: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  country: string | null
  company_id: string
  active: boolean | null
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 15: params es una promise, hay que usar `use()` para extraerlo
  const { id } = use(params)
  const router = useRouter()
  const [client, setClient] = useState<ClientRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const sb = createClient()
        const { data, error: err } = await sb
          .from('tt_clients')
          .select('id, name, legal_name, trade_name, tax_id, email, phone, whatsapp, address, city, country, company_id, active')
          .eq('id', id)
          .maybeSingle()
        if (cancelled) return
        if (err) throw err
        if (!data) throw new Error('Cliente no encontrado')
        setClient(data as ClientRow)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error cargando cliente')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-sm text-[#6B7280]">Cargando cliente…</div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <button onClick={() => router.back()} className="text-xs text-[#9CA3AF] hover:text-[#F0F2F5] flex items-center gap-1 mb-4">
          <ArrowLeft size={12} /> Volver
        </button>
        <Card>
          <CardContent>
            <div className="flex items-center gap-3 py-8 text-amber-400">
              <AlertCircle size={20} />
              <span>{error || 'Cliente no encontrado'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const companyName = clientCompanyName(client)
  const likelyContact = clientLikelyContactName(client)
  const isInactive = client.active === false

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => router.back()} className="text-xs text-[#9CA3AF] hover:text-[#F0F2F5] flex items-center gap-1 mb-2">
            <ArrowLeft size={12} /> Volver
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 size={20} className="text-[#FF6600]" />
            {companyName}
            {isInactive && (
              <span className="text-[10px] uppercase tracking-wide bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">
                Inactivo
              </span>
            )}
          </h1>
          {likelyContact && (
            <p className="text-xs text-amber-400/80 mt-1" title="El campo 'name' del cliente parece nombre de persona — probablemente debería ser un contacto.">
              ⚠ name: {likelyContact} (probablemente es un contacto, no la empresa)
            </p>
          )}
        </div>
      </div>

      {/* Datos básicos compactos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {client.tax_id && (
              <div>
                <dt className="text-xs text-[#6B7280]">CUIT/CIF/NIF</dt>
                <dd className="text-[#F0F2F5]">{client.tax_id}</dd>
              </div>
            )}
            {client.email && (
              <div>
                <dt className="text-xs text-[#6B7280] flex items-center gap-1"><Mail size={11} /> Email</dt>
                <dd className="text-[#F0F2F5] truncate">{client.email}</dd>
              </div>
            )}
            {client.phone && (
              <div>
                <dt className="text-xs text-[#6B7280] flex items-center gap-1"><Phone size={11} /> Teléfono</dt>
                <dd className="text-[#F0F2F5]">{client.phone}</dd>
              </div>
            )}
            {(client.address || client.city || client.country) && (
              <div>
                <dt className="text-xs text-[#6B7280] flex items-center gap-1"><MapPin size={11} /> Ubicación</dt>
                <dd className="text-[#F0F2F5]">
                  {[client.address, client.city, client.country].filter(Boolean).join(', ')}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex gap-2 text-xs">
            <Link
              href={`/cotizador?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(companyName)}`}
              className="px-3 py-1.5 rounded-md border border-[#FF6600]/40 bg-[#FF6600]/10 text-[#FF6600] hover:bg-[#FF6600]/20 transition"
            >
              + Nueva cotización
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Glosario SKU — panel principal por el que el usuario llegó acá */}
      <SkuGlossary clientId={client.id} companyId={client.company_id} />
    </div>
  )
}
