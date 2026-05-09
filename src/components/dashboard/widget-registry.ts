// Registro central de widgets disponibles para el dashboard

export interface WidgetDefinition {
  id: string
  name: string
  description: string
  category: 'kpis' | 'graficos' | 'listas' | 'operativo' | 'comunicacion'
  icon: string // nombre del icono de Lucide
  defaultW: number
  defaultH: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  /** Si está, la card del dashboard lleva a esta URL al click (fuera de modo edición) */
  href?: string
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // KPIs
  {
    id: 'kpi-products',
    name: 'Total Productos',
    description: 'Cantidad de productos en el catalogo',
    category: 'kpis',
    icon: 'Package',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/catalogo',
  },
  {
    id: 'kpi-clients',
    name: 'Total Clientes',
    description: 'Clientes registrados en el sistema',
    category: 'kpis',
    icon: 'Users',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/clientes',
  },
  {
    id: 'kpi-quotes-month',
    name: 'Cotizaciones del Mes',
    description: 'Cotizaciones creadas este mes',
    category: 'kpis',
    icon: 'FileText',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/cotizador',
  },
  {
    id: 'kpi-pipeline',
    name: 'Pipeline CRM',
    description: 'Valor ponderado del pipeline',
    category: 'kpis',
    icon: 'Target',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/crm',
  },
  {
    id: 'kpi-pending-delivery',
    name: 'Entregas Pendientes',
    description: 'Pedidos pendientes de entrega',
    category: 'kpis',
    icon: 'Truck',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/ventas?tab=pedidos',
  },
  {
    id: 'kpi-pending-invoices',
    name: 'Facturacion Pendiente',
    description: 'Entregas pendientes de facturar',
    category: 'kpis',
    icon: 'Receipt',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/ventas?tab=remitos',
  },
  {
    id: 'kpi-pending-collection',
    name: 'Cobros Pendientes',
    description: 'Facturas pendientes de cobro',
    category: 'kpis',
    icon: 'Banknote',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/cobros',
  },
  {
    id: 'kpi-stock-alerts',
    name: 'Alertas de Stock',
    description: 'Productos bajo stock minimo',
    category: 'kpis',
    icon: 'AlertTriangle',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/stock',
  },
  {
    id: 'kpi-pending-payments',
    name: 'Pagos Pendientes',
    description: 'Facturas de compra pendientes de pago',
    category: 'kpis',
    icon: 'CreditCard',
    defaultW: 2,
    defaultH: 1,
    minW: 2,
    minH: 1,
    href: '/compras',
  },
  // Listas
  {
    id: 'widget-recent-activity',
    name: 'Actividad Reciente',
    description: 'Ultimas acciones en el sistema',
    category: 'listas',
    icon: 'Activity',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  {
    id: 'widget-recent-quotes',
    name: 'Cotizaciones Recientes',
    description: 'Ultimas cotizaciones creadas',
    category: 'listas',
    icon: 'FileText',
    defaultW: 6,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  {
    id: 'widget-alerts',
    name: 'Alertas Activas',
    description: 'Alertas y notificaciones pendientes',
    category: 'comunicacion',
    icon: 'Bell',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  {
    id: 'widget-calendar-today',
    name: 'Eventos de Hoy',
    description: 'Agenda del dia',
    category: 'operativo',
    icon: 'Calendar',
    defaultW: 4,
    defaultH: 2,
    minW: 3,
    minH: 2,
  },
  {
    id: 'widget-delivery-progress',
    name: 'Entregas en Curso',
    description: 'Progreso de entregas activas',
    category: 'operativo',
    icon: 'TruckIcon',
    defaultW: 6,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  // Graficos
  {
    id: 'widget-pipeline-chart',
    name: 'Grafico Pipeline',
    description: 'Pipeline CRM por etapa',
    category: 'graficos',
    icon: 'BarChart3',
    defaultW: 6,
    defaultH: 3,
    minW: 4,
    minH: 2,
  },
  {
    id: 'widget-sales-chart',
    name: 'Tendencia de Ventas',
    description: 'Cotizaciones por mes (6 meses)',
    category: 'graficos',
    icon: 'TrendingUp',
    defaultW: 6,
    defaultH: 3,
    minW: 4,
    minH: 2,
  },
  {
    id: 'widget-brand-distribution',
    name: 'Productos por Marca',
    description: 'Distribucion de productos por marca',
    category: 'graficos',
    icon: 'PieChart',
    defaultW: 4,
    defaultH: 3,
    minW: 3,
    minH: 2,
  },
  // Operativo
  {
    id: 'widget-quick-actions',
    name: 'Acciones Rapidas',
    description: 'Accesos directos a funciones clave',
    category: 'operativo',
    icon: 'Zap',
    defaultW: 4,
    defaultH: 2,
    minW: 3,
    minH: 2,
  },
  {
    id: 'widget-welcome',
    name: 'Bienvenida',
    description: 'Tarjeta de bienvenida con info del usuario',
    category: 'operativo',
    icon: 'Home',
    defaultW: 4,
    defaultH: 2,
    minW: 3,
    minH: 1,
  },
]

export const WIDGET_CATEGORIES = [
  { id: 'kpis', label: 'KPIs', icon: 'BarChart3' },
  { id: 'graficos', label: 'Graficos', icon: 'PieChart' },
  { id: 'listas', label: 'Listas', icon: 'List' },
  { id: 'operativo', label: 'Operativo', icon: 'Settings' },
  { id: 'comunicacion', label: 'Comunicacion', icon: 'Bell' },
] as const

export type WidgetId = typeof WIDGET_REGISTRY[number]['id']

export interface DashboardLayoutItem {
  i: string       // widget id (unique instance key)
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  widgetType: string  // which widget component to render
  minimized?: boolean
}

export const DEFAULT_LAYOUT: DashboardLayoutItem[] = [
  // Row 1: Welcome + 4 KPIs
  { i: 'welcome-1', x: 0, y: 0, w: 4, h: 2, minW: 3, minH: 1, widgetType: 'widget-welcome' },
  { i: 'kpi-products-1', x: 4, y: 0, w: 2, h: 1, minW: 2, minH: 1, widgetType: 'kpi-products' },
  { i: 'kpi-clients-1', x: 6, y: 0, w: 2, h: 1, minW: 2, minH: 1, widgetType: 'kpi-clients' },
  { i: 'kpi-quotes-1', x: 8, y: 0, w: 2, h: 1, minW: 2, minH: 1, widgetType: 'kpi-quotes-month' },
  { i: 'kpi-pipeline-1', x: 10, y: 0, w: 2, h: 1, minW: 2, minH: 1, widgetType: 'kpi-pipeline' },
  // Row 2: Quick Actions + Activity + Alerts
  { i: 'quick-actions-1', x: 0, y: 2, w: 4, h: 2, minW: 3, minH: 2, widgetType: 'widget-quick-actions' },
  { i: 'activity-1', x: 4, y: 1, w: 4, h: 3, minW: 3, minH: 2, widgetType: 'widget-recent-activity' },
  { i: 'alerts-1', x: 8, y: 1, w: 4, h: 3, minW: 3, minH: 2, widgetType: 'widget-alerts' },
  // Row 3: Charts
  { i: 'pipeline-chart-1', x: 0, y: 4, w: 6, h: 3, minW: 4, minH: 2, widgetType: 'widget-pipeline-chart' },
  { i: 'sales-chart-1', x: 6, y: 4, w: 6, h: 3, minW: 4, minH: 2, widgetType: 'widget-sales-chart' },
  // Row 4: Quotes + Deliveries
  { i: 'recent-quotes-1', x: 0, y: 7, w: 6, h: 3, minW: 3, minH: 2, widgetType: 'widget-recent-quotes' },
  { i: 'delivery-progress-1', x: 6, y: 7, w: 6, h: 3, minW: 3, minH: 2, widgetType: 'widget-delivery-progress' },
]
