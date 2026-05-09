'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ResponsiveGridLayout as ResponsiveGrid, useContainerWidth, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import { Lock, Unlock, Plus, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { WidgetWrapper } from './widget-wrapper'
import { WidgetPicker } from './widget-picker'
import {
  WIDGET_REGISTRY,
  DEFAULT_LAYOUT,
  type DashboardLayoutItem,
  type WidgetDefinition,
} from './widget-registry'

// Widget component imports
import { KpiProducts } from './widgets/kpi-products'
import { KpiClients } from './widgets/kpi-clients'
import { KpiQuotesMonth } from './widgets/kpi-quotes-month'
import { KpiPipeline } from './widgets/kpi-pipeline'
import { KpiPendingDelivery } from './widgets/kpi-pending-delivery'
import { KpiPendingInvoices } from './widgets/kpi-pending-invoices'
import { KpiPendingCollection } from './widgets/kpi-pending-collection'
import { KpiStockAlerts } from './widgets/kpi-stock-alerts'
import { KpiPendingPayments } from './widgets/kpi-pending-payments'
import { WidgetRecentActivity } from './widgets/widget-recent-activity'
import { WidgetRecentQuotes } from './widgets/widget-recent-quotes'
import { WidgetQuickActions } from './widgets/widget-quick-actions'
import { WidgetDeliveryProgress } from './widgets/widget-delivery-progress'
import { WidgetAlerts } from './widgets/widget-alerts'
import { WidgetCalendarToday } from './widgets/widget-calendar-today'
import { WidgetPipelineChart } from './widgets/widget-pipeline-chart'
import { WidgetSalesChart } from './widgets/widget-sales-chart'
import { WidgetBrandDistribution } from './widgets/widget-brand-distribution'
import { WidgetWelcome } from './widgets/widget-welcome'

// Mapa de tipo de widget -> componente React
const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  'kpi-products': KpiProducts,
  'kpi-clients': KpiClients,
  'kpi-quotes-month': KpiQuotesMonth,
  'kpi-pipeline': KpiPipeline,
  'kpi-pending-delivery': KpiPendingDelivery,
  'kpi-pending-invoices': KpiPendingInvoices,
  'kpi-pending-collection': KpiPendingCollection,
  'kpi-stock-alerts': KpiStockAlerts,
  'kpi-pending-payments': KpiPendingPayments,
  'widget-recent-activity': WidgetRecentActivity,
  'widget-recent-quotes': WidgetRecentQuotes,
  'widget-quick-actions': WidgetQuickActions,
  'widget-delivery-progress': WidgetDeliveryProgress,
  'widget-alerts': WidgetAlerts,
  'widget-calendar-today': WidgetCalendarToday,
  'widget-pipeline-chart': WidgetPipelineChart,
  'widget-sales-chart': WidgetSalesChart,
  'widget-brand-distribution': WidgetBrandDistribution,
  'widget-welcome': WidgetWelcome,
}

// Nombres de display para cada widget
const WIDGET_TITLES: Record<string, string> = {}
WIDGET_REGISTRY.forEach(w => {
  WIDGET_TITLES[w.id] = w.name
})

const LAYOUT_KEY_PREFIX = 'dashboard_layout_'
const USER_ID = 'default_user' // Se puede cambiar cuando haya auth

interface DashboardGridProps {
  userId?: string
}

export function DashboardGrid({ userId = USER_ID }: DashboardGridProps) {
  const { width, containerRef } = useContainerWidth({ initialWidth: 1200 })
  const [widgets, setWidgets] = useState<DashboardLayoutItem[]>([])
  const [editing, setEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cargar layout desde Supabase
  useEffect(() => {
    async function loadLayout() {
      try {
        const supabase = createClient()
        const key = `${LAYOUT_KEY_PREFIX}${userId}`

        const { data, error } = await supabase
          .from('tt_system_params')
          .select('value')
          .eq('key', key)
          .maybeSingle()

        if (error) {
          console.error('Error cargando layout:', error)
          setWidgets(DEFAULT_LAYOUT)
        } else if (data?.value) {
          try {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
            if (Array.isArray(parsed) && parsed.length > 0) {
              setWidgets(parsed)
            } else {
              setWidgets(DEFAULT_LAYOUT)
            }
          } catch {
            setWidgets(DEFAULT_LAYOUT)
          }
        } else {
          setWidgets(DEFAULT_LAYOUT)
        }
      } catch {
        setWidgets(DEFAULT_LAYOUT)
      } finally {
        setLoading(false)
      }
    }
    loadLayout()
  }, [userId])

  // Guardar layout en Supabase
  const saveLayout = useCallback(async (layoutItems: DashboardLayoutItem[]) => {
    try {
      const supabase = createClient()
      const key = `${LAYOUT_KEY_PREFIX}${userId}`

      const { error } = await supabase
        .from('tt_system_params')
        .upsert({
          key,
          value: JSON.stringify(layoutItems),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

      if (error) {
        console.error('Error guardando layout:', error)
      } else {
        setHasChanges(false)
      }
    } catch (err) {
      console.error('Error guardando layout:', err)
    }
  }, [userId])

  // Auto-save debounced (2s)
  const debouncedSave = useCallback((items: DashboardLayoutItem[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveLayout(items)
    }, 2000)
  }, [saveLayout])

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Cuando cambia el layout por drag/resize
  const handleLayoutChange = useCallback((layout: Layout) => {
    setWidgets(prev => {
      const updated = prev.map(widget => {
        const layoutItem = layout.find(l => l.i === widget.i)
        if (layoutItem) {
          return {
            ...widget,
            x: layoutItem.x,
            y: layoutItem.y,
            w: layoutItem.w,
            h: layoutItem.h,
          }
        }
        return widget
      })
      setHasChanges(true)
      debouncedSave(updated)
      return updated
    })
  }, [debouncedSave])

  // Quitar widget
  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgets(prev => {
      const updated = prev.filter(w => w.i !== widgetId)
      setHasChanges(true)
      debouncedSave(updated)
      return updated
    })
  }, [debouncedSave])

  // Minimizar widget
  const handleMinimizeWidget = useCallback((widgetId: string) => {
    setWidgets(prev => {
      const updated = prev.map(w =>
        w.i === widgetId ? { ...w, minimized: !w.minimized } : w
      )
      setHasChanges(true)
      debouncedSave(updated)
      return updated
    })
  }, [debouncedSave])

  // Agregar widget desde picker
  const handleAddWidget = useCallback((definition: WidgetDefinition) => {
    setWidgets(prev => {
      // Generar id unico
      const count = prev.filter(w => w.widgetType === definition.id).length
      const newId = `${definition.id}-${count + 1}-${Date.now()}`

      const newWidget: DashboardLayoutItem = {
        i: newId,
        x: 0,
        y: Infinity, // react-grid-layout lo pone al final
        w: definition.defaultW,
        h: definition.defaultH,
        minW: definition.minW,
        minH: definition.minH,
        maxW: definition.maxW,
        maxH: definition.maxH,
        widgetType: definition.id,
      }

      const updated = [...prev, newWidget]
      setHasChanges(true)
      debouncedSave(updated)
      return updated
    })
  }, [debouncedSave])

  // Restaurar layout default
  const handleRestore = useCallback(() => {
    setWidgets(DEFAULT_LAYOUT)
    setHasChanges(true)
    debouncedSave(DEFAULT_LAYOUT)
  }, [debouncedSave])

  // Guardar manual
  const handleSave = useCallback(() => {
    saveLayout(widgets)
  }, [widgets, saveLayout])

  // Convertir widgets a layout de react-grid-layout
  const gridLayout = useMemo(() => {
    return widgets.map(w => ({
      i: w.i,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.minimized ? 1 : w.h,
      minW: w.minW,
      minH: w.minimized ? 1 : w.minH,
      maxW: w.maxW,
      maxH: w.maxH,
      static: !editing,
    }))
  }, [widgets, editing])

  // Widget types activos
  const activeWidgetTypes = useMemo(() => {
    return widgets.map(w => w.widgetType)
  }, [widgets])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-[#141820] rounded-lg animate-pulse" />
          <div className="h-10 w-40 bg-[#141820] rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-[#141820] rounded-xl border border-[#1E2330] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-64 bg-[#141820] rounded-xl border border-[#1E2330] animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-[#F0F2F5]">Dashboard</h1>

        <div className="flex items-center gap-2">
          {editing && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPicker(true)}
                className="gap-1.5"
              >
                <Plus size={14} /> Agregar widget
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestore}
                className="gap-1.5 text-[#6B7280]"
              >
                <RotateCcw size={14} /> Restaurar default
              </Button>
            </>
          )}
          {hasChanges && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className="gap-1.5"
            >
              <Save size={14} /> Guardar
            </Button>
          )}
          <Button
            variant={editing ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setEditing(!editing)}
            className="gap-1.5"
          >
            {editing ? <Unlock size={14} /> : <Lock size={14} />}
            {editing ? 'Editando' : 'Editar dashboard'}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        className={cn(
          'dashboard-grid-container',
          editing && 'dashboard-editing'
        )}
      >
        <ResponsiveGrid
          width={width}
          layouts={{ lg: gridLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
          rowHeight={100}
          dragConfig={{ enabled: editing, handle: '.drag-handle', bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: editing, handles: ['se'] }}
          onLayoutChange={handleLayoutChange}
          compactor={verticalCompactor}
          margin={[12, 12] as const}
          containerPadding={[0, 0] as const}
        >
          {widgets.map(widget => {
            const Component = WIDGET_COMPONENTS[widget.widgetType]
            const title = WIDGET_TITLES[widget.widgetType] || widget.widgetType
            // Sprint 2C — href de la card desde el registry para navegación
            const href = WIDGET_REGISTRY.find(w => w.id === widget.widgetType)?.href

            return (
              <div key={widget.i} className="group">
                <WidgetWrapper
                  title={title}
                  editing={editing}
                  minimized={widget.minimized}
                  onRemove={() => handleRemoveWidget(widget.i)}
                  onMinimize={() => handleMinimizeWidget(widget.i)}
                  href={href}
                >
                  {Component ? <Component /> : <div className="text-xs text-[#4B5563]">Widget no encontrado</div>}
                </WidgetWrapper>
              </div>
            )
          })}
        </ResponsiveGrid>
      </div>

      {/* Widget Picker Modal */}
      <WidgetPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onAdd={handleAddWidget}
        activeWidgetTypes={activeWidgetTypes}
      />
    </div>
  )
}
