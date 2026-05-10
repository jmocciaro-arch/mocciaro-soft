'use client'

/**
 * INICIO — Bandeja de trabajo task-first
 *
 * Reemplaza al dashboard como pantalla inicial. En lugar de KPIs muestra
 * lo que requiere acción HOY: cotizaciones por enviar, OCs por revisar,
 * pedidos por entregar, facturas por cobrar, stock bajo, tickets SAT abiertos.
 *
 * Cada tarjeta = 1 query a Supabase + 1 botón claro de "ir y resolver".
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { cn } from '@/lib/utils'
import {
  FileText, Mail, Truck, DollarSign, Box, Wrench,
  Upload, AlertCircle, ArrowRight, RefreshCw,
  CheckCircle2, FilePlus, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Row = Record<string, unknown>

interface TrayCard {
  id: string
  title: string
  subtitle: string
  count: number
  amount?: number | null
  currency?: string
  tone: 'orange' | 'red' | 'amber' | 'blue' | 'emerald' | 'violet'
  icon: LucideIcon
  href: string
  cta: string
  emptyMessage: string
}

const TONE_STYLES: Record<TrayCard['tone'], {
  border: string; bg: string; iconBg: string; icon: string; count: string; cta: string;
}> = {
  orange:  { border: 'border-[#FF6600]/30', bg: 'from-[#FF6600]/10', iconBg: 'bg-[#FF6600]/15', icon: 'text-[#FF6600]', count: 'text-[#FF6600]', cta: 'bg-[#FF6600] hover:bg-[#FF7711] text-white' },
  red:     { border: 'border-red-500/30',   bg: 'from-red-500/10',   iconBg: 'bg-red-500/15',   icon: 'text-red-400',   count: 'text-red-400',   cta: 'bg-red-600 hover:bg-red-500 text-white' },
  amber:   { border: 'border-amber-500/30', bg: 'from-amber-500/10', iconBg: 'bg-amber-500/15', icon: 'text-amber-400', count: 'text-amber-400', cta: 'bg-amber-500 hover:bg-amber-400 text-black' },
  blue:    { border: 'border-blue-500/30',  bg: 'from-blue-500/10',  iconBg: 'bg-blue-500/15',  icon: 'text-blue-400',  count: 'text-blue-400',  cta: 'bg-blue-600 hover:bg-blue-500 text-white' },
  emerald: { border: 'border-emerald-500/30', bg: 'from-emerald-500/10', iconBg: 'bg-emerald-500/15', icon: 'text-emerald-400', count: 'text-emerald-400', cta: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  violet:  { border: 'border-violet-500/30', bg: 'from-violet-500/10', iconBg: 'bg-violet-500/15', icon: 'text-violet-400', count: 'text-violet-400', cta: 'bg-violet-600 hover:bg-violet-500 text-white' },
}

export default function InicioPage() {
  const { activeCompany, activeCompanyIds, isMultiMode } = useCompanyContext()
  const companyFilter = useMemo(
    () => isMultiMode ? activeCompanyIds : (activeCompany ? [activeCompany.id] : []),
    [isMultiMode, activeCompanyIds, activeCompany]
  )

  const [cards, setCards] = useState<TrayCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  const loadTray = useCallback(async () => {
    if (companyFilter.length === 0) { setLoading(false); return }
    setLoading(true)
    const sb = createClient()

    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    // Lanzamos todas las queries en paralelo
    const [
      cotizPorEnviar, ocPendientes, pedidosPorEntregar,
      facturasPorCobrar, facturasVencidas, stockBajo,
      ticketsSatAbiertos, leadsHot,
    ] = await Promise.all([
      // 1. Cotizaciones en borrador (por enviar)
      sb.from('tt_documents')
        .select('id, total, currency', { count: 'exact', head: false })
        .eq('type', 'presupuesto')
        .in('status', ['draft', 'borrador'])
        .in('company_id', companyFilter)
        .limit(100),

      // 2. OCs de cliente recibidas sin convertir
      sb.from('tt_documents')
        .select('id, total, currency', { count: 'exact', head: false })
        .eq('type', 'client_po')
        .in('status', ['received', 'uploaded', 'parsed'])
        .in('company_id', companyFilter)
        .limit(100),

      // 3. Pedidos confirmados sin entregar
      sb.from('tt_documents')
        .select('id, total, currency', { count: 'exact', head: false })
        .eq('type', 'pedido')
        .in('status', ['open', 'accepted', 'confirmado', 'partially_delivered'])
        .in('company_id', companyFilter)
        .limit(100),

      // 4. Facturas emitidas sin cobrar
      sb.from('tt_documents')
        .select('id, total, currency', { count: 'exact', head: false })
        .eq('type', 'factura')
        .in('status', ['pending', 'emitted', 'sent', 'partial'])
        .in('company_id', companyFilter)
        .limit(200),

      // 5. Facturas vencidas (más urgente)
      sb.from('tt_documents')
        .select('id, total, currency, due_date', { count: 'exact', head: false })
        .eq('type', 'factura')
        .in('status', ['pending', 'emitted', 'sent', 'partial', 'overdue'])
        .in('company_id', companyFilter)
        .lt('due_date', today)
        .limit(200),

      // 6. Stock bajo mínimo
      sb.from('tt_stock')
        .select('id, quantity, min_quantity', { count: 'exact', head: false })
        .gt('min_quantity', 0)
        .limit(200),

      // 7. Tickets SAT abiertos
      sb.from('tt_sat_tickets')
        .select('id', { count: 'exact', head: false })
        .in('status', ['abierto', 'en_proceso', 'esperando_repuesto'])
        .limit(100),

      // 8. Leads HOT (oportunidades en lead/propuesta con actividad reciente)
      sb.from('tt_opportunities')
        .select('id, expected_value', { count: 'exact', head: false })
        .in('stage', ['lead', 'propuesta'])
        .gte('updated_at', sevenDaysAgo)
        .in('company_id', companyFilter)
        .limit(100),
    ])

    const sumTotal = (rows: Row[] | null) =>
      (rows || []).reduce((acc, r) => acc + (Number(r.total) || 0), 0)

    // Stock bajo: filtrar client-side porque no podemos comparar columnas en supabase-js fácil
    const stockLowRows = (stockBajo.data || []).filter(
      (r: Row) => Number(r.quantity ?? 0) < Number(r.min_quantity ?? 0)
    )

    const newCards: TrayCard[] = [
      {
        id: 'facturas-vencidas',
        title: 'Facturas vencidas',
        subtitle: 'Cobranza urgente — pasaron de fecha de pago',
        count: facturasVencidas.count ?? facturasVencidas.data?.length ?? 0,
        amount: sumTotal(facturasVencidas.data as Row[] | null),
        currency: 'EUR',
        tone: 'red',
        icon: AlertCircle,
        href: '/cobros?filter=overdue',
        cta: 'Gestionar cobro',
        emptyMessage: '✅ Sin vencidas — todo al día',
      },
      {
        id: 'cotizaciones-borrador',
        title: 'Cotizaciones por enviar',
        subtitle: 'Borradores listos para mandar al cliente',
        count: cotizPorEnviar.count ?? cotizPorEnviar.data?.length ?? 0,
        amount: sumTotal(cotizPorEnviar.data as Row[] | null),
        currency: 'EUR',
        tone: 'orange',
        icon: Mail,
        href: '/ventas?tab=presupuestos&filter=draft',
        cta: 'Revisar y enviar',
        emptyMessage: 'No hay borradores pendientes',
      },
      {
        id: 'oc-pendientes',
        title: 'OCs de cliente sin revisar',
        subtitle: 'Importadas o recibidas — falta convertir a pedido',
        count: ocPendientes.count ?? ocPendientes.data?.length ?? 0,
        amount: sumTotal(ocPendientes.data as Row[] | null),
        currency: 'EUR',
        tone: 'violet',
        icon: Upload,
        href: '/cotizador?tab=oc',
        cta: 'Procesar OC',
        emptyMessage: 'Sin OCs pendientes de revisar',
      },
      {
        id: 'pedidos-entregar',
        title: 'Pedidos por entregar',
        subtitle: 'Confirmados — necesitan remito o albarán',
        count: pedidosPorEntregar.count ?? pedidosPorEntregar.data?.length ?? 0,
        amount: sumTotal(pedidosPorEntregar.data as Row[] | null),
        currency: 'EUR',
        tone: 'amber',
        icon: Truck,
        href: '/ventas?tab=pedidos',
        cta: 'Preparar entrega',
        emptyMessage: 'Sin pedidos pendientes',
      },
      {
        id: 'facturas-cobrar',
        title: 'Facturas por cobrar',
        subtitle: 'Emitidas, esperando pago del cliente',
        count: facturasPorCobrar.count ?? facturasPorCobrar.data?.length ?? 0,
        amount: sumTotal(facturasPorCobrar.data as Row[] | null),
        currency: 'EUR',
        tone: 'blue',
        icon: DollarSign,
        href: '/ventas?tab=facturas&filter=pending',
        cta: 'Ver pendientes',
        emptyMessage: '✅ Todo cobrado',
      },
      {
        id: 'stock-bajo',
        title: 'Stock bajo mínimo',
        subtitle: 'Productos por debajo del nivel mínimo configurado',
        count: stockLowRows.length,
        amount: null,
        tone: 'red',
        icon: Box,
        href: '/stock?filter=low',
        cta: 'Generar OC',
        emptyMessage: 'Stock OK en todos los productos',
      },
      {
        id: 'sat-abiertos',
        title: 'Tickets SAT abiertos',
        subtitle: 'Reparaciones en curso o pendientes',
        count: ticketsSatAbiertos.count ?? ticketsSatAbiertos.data?.length ?? 0,
        amount: null,
        tone: 'amber',
        icon: Wrench,
        href: '/sat',
        cta: 'Atender tickets',
        emptyMessage: 'Ningún ticket abierto',
      },
      {
        id: 'leads-hot',
        title: 'Leads activos',
        subtitle: 'Oportunidades con actividad en los últimos 7 días',
        count: leadsHot.count ?? leadsHot.data?.length ?? 0,
        amount: (leadsHot.data || []).reduce((a, r: Row) => a + (Number(r.expected_value) || 0), 0),
        currency: 'EUR',
        tone: 'emerald',
        icon: FilePlus,
        href: '/crm',
        cta: 'Trabajar pipeline',
        emptyMessage: 'Sin leads activos esta semana',
      },
    ]

    setCards(newCards)
    setLoading(false)
  }, [companyFilter])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await loadTray()
    })()
    return () => { cancelled = true }
  }, [loadTray, refreshTick])

  const totalPendientes = cards.reduce((acc, c) => acc + c.count, 0)
  const cardsConItems = cards.filter(c => c.count > 0)
  const cardsVacios = cards.filter(c => c.count === 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Bandeja de trabajo</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            {loading
              ? 'Calculando lo que requiere tu atención hoy...'
              : totalPendientes === 0
                ? '🎉 No tenés nada pendiente. ¡Buen trabajo!'
                : `${totalPendientes} ítems requieren acción · ${cardsConItems.length} de 8 categorías`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141820] border border-[#1E2330] hover:border-[#2A3040] text-xs text-[#9CA3AF] hover:text-[#F0F2F5] transition-colors"
          >
            Ver KPIs <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-[#141820] border border-[#1E2330] animate-pulse" />
          ))}
        </div>
      )}

      {/* Tarjetas con items pendientes */}
      {!loading && cardsConItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {cardsConItems.map((card) => (
            <TrayCardView key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* Tarjetas vacías (resumen de "está OK") */}
      {!loading && cardsVacios.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3 flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-400" /> Sin pendientes
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {cardsVacios.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-emerald-500/20 transition-colors"
              >
                <CheckCircle2 size={14} className="text-emerald-500/60 shrink-0" />
                <span className="text-xs text-[#6B7280] truncate group-hover:text-[#9CA3AF]">{card.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Acciones rápidas (atajos) */}
      <div className="rounded-xl border border-[#1E2330] bg-[#141820] p-5">
        <h3 className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
          Empezar algo nuevo
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <QuickAction href="/cotizador" icon={FileText} label="Nueva cotización" />
          <QuickAction href="/cotizador?tab=oc&action=upload" icon={Upload} label="Importar OC cliente" />
          <QuickAction href="/crm?action=new" icon={FilePlus} label="Nuevo lead" />
          <QuickAction href="/compras?action=new" icon={ShoppingBag} label="Pedido a proveedor" />
          <QuickAction href="/sat?action=new" icon={Wrench} label="Ticket SAT" />
        </div>
      </div>
    </div>
  )
}

// ===============================================================
// Sub-components
// ===============================================================

function TrayCardView({ card }: { card: TrayCard }) {
  const styles = TONE_STYLES[card.tone]
  const Icon = card.icon

  return (
    <Link
      href={card.href}
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        'bg-gradient-to-br to-[#141820]',
        'hover:translate-y-[-2px] hover:shadow-xl',
        styles.border,
        styles.bg,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', styles.iconBg)}>
          <Icon size={18} className={styles.icon} />
        </div>
        <span className={cn('text-3xl font-bold leading-none', styles.count)}>
          {card.count}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-[#F0F2F5] mb-1">{card.title}</h3>
      <p className="text-xs text-[#6B7280] line-clamp-2 mb-3">{card.subtitle}</p>

      {card.amount != null && card.amount > 0 && (
        <p className="text-xs text-[#9CA3AF] mb-3">
          Total: <span className="font-semibold text-[#F0F2F5]">
            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: card.currency || 'EUR', maximumFractionDigits: 0 }).format(card.amount)}
          </span>
        </p>
      )}

      <div className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
        styles.cta,
      )}>
        {card.cta}
        <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/40 hover:bg-[#FF6600]/5 transition-colors group"
    >
      <Icon size={14} className="text-[#9CA3AF] group-hover:text-[#FF6600] shrink-0" />
      <span className="text-xs font-medium text-[#F0F2F5] truncate">{label}</span>
    </Link>
  )
}
