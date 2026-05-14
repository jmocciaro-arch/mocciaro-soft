/**
 * Nav tree — Mocciaro Soft con estructura StelOrder.
 *
 * - Top nav: 10 secciones (Inicio, Catálogo, Clientes, Ventas, SAT, Proyectos,
 *   Facturación, Compras, Agenda, Informes).
 * - Sub-sidebar contextual con los hijos de la sección activa.
 * - Item con `dividerBefore: true` => renderizar separador visual antes.
 * - Features Mocciaro que no encajan en StelOrder => `moreSection` (icono ⊞).
 * - Usuario => `userDropdown`.
 *
 * REGLAS:
 * - URLs reales = rutas Mocciaro existentes. Labels visibles = StelOrder.
 * - Nada que renombrar tablas/modelos.
 */

import {
  LayoutDashboard, Package, Users, FileText, Wrench, FolderKanban,
  CreditCard, ShoppingCart, Calendar, BarChart3, Grid3X3,
  ClipboardList, Truck, Receipt, Banknote, RefreshCw, Building2,
  Warehouse, Cpu, Box, Layers, BookOpen, Pause, History, Target,
  Sparkles, Workflow, TrendingUp, Settings, Zap, MessageCircle,
  Globe, Bot, Tag, UserCircle, Mail, ScanLine, Briefcase, Boxes,
  User, Lock, Keyboard, LogOut, HelpCircle, Wallet, BookText,
  TrendingUpDown, PieChart, Activity, Percent,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type NavLeaf = {
  label: string
  href: string
  icon?: typeof LayoutDashboard
  badgeKey?: string
  requiredPermissions?: string[]
  /** Renderizar separador visual antes de este item. */
  dividerBefore?: boolean
}

export type NavSection = {
  id: string
  label: string
  href: string
  icon?: typeof LayoutDashboard
  children?: NavLeaf[]
  matchPaths?: RegExp[]
  requiredPermissions?: string[]
}

export type UserDropdownItem =
  & { label: string; icon?: typeof LayoutDashboard; dividerBefore?: boolean }
  & ({ href: string } | { action: 'help' | 'shortcuts' | 'logout' })

// ─────────────────────────────────────────────────────────────────────────────
// Top nav: 10 secciones
// ─────────────────────────────────────────────────────────────────────────────

export const navSections: NavSection[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    href: '/inicio',
    icon: LayoutDashboard,
    matchPaths: [/^\/inicio/, /^\/dashboard$/, /^\/$/],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    href: '/catalogo',
    icon: Package,
    requiredPermissions: ['view_catalog'],
    matchPaths: [/^\/catalogo/, /^\/buscador($|\/)/, /^\/gastos/],
    children: [
      { label: 'Productos',           href: '/catalogo',                 icon: Package },
      { label: 'Servicios',           href: '/catalogo?tab=servicios',   icon: Tag },
      { label: 'Gastos e inversiones', href: '/gastos',                  icon: Receipt },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    href: '/clientes',
    icon: Users,
    requiredPermissions: ['view_clients'],
    matchPaths: [/^\/clientes/, /^\/crm/, /^\/buscador-clientes/],
    children: [
      { label: 'Clientes',             href: '/clientes',                  icon: Users },
      { label: 'Clientes potenciales', href: '/crm',                       icon: Target,      requiredPermissions: ['view_crm'] },
      { label: 'Personas de contacto', href: '/clientes?tab=contactos',    icon: UserCircle },
      { label: 'Buscador web',         href: '/clientes/buscador-web',     icon: Globe,       requiredPermissions: ['admin_users'] },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    href: '/cotizador',
    icon: FileText,
    // /ventas?tab=pedidos|albaranes ⇒ Ventas. /ventas?tab=facturas|notas|cobros y /ventas/recurrentes ⇒ Facturación (más abajo).
    matchPaths: [
      /^\/cotizador/,
      /^\/ventas(\?tab=(pedidos|albaranes))/,
      /^\/ventas$/,
      /^\/ventas\/importar-oc/,
      /^\/documentos/,
    ],
    children: [
      { label: 'Presupuestos',       href: '/cotizador',           icon: FileText,     badgeKey: 'quotes_draft', requiredPermissions: ['create_quote', 'edit_quote', 'view_sales_reports'] },
      { label: 'Pedidos',            href: '/ventas?tab=pedidos',  icon: ClipboardList, badgeKey: 'so_open',     requiredPermissions: ['create_order', 'approve_order', 'view_sales_reports'] },
      { label: 'Albaranes de venta', href: '/ventas?tab=albaranes', icon: Truck,                                  requiredPermissions: ['create_order', 'view_sales_reports'] },
    ],
  },
  {
    id: 'sat',
    label: 'SAT',
    href: '/sat',
    icon: Wrench,
    requiredPermissions: ['view_sat'],
    matchPaths: [/^\/sat($|\/)/],
    children: [
      // Flujo StelOrder
      { label: 'Incidencias',          href: '/sat',              icon: Wrench,        badgeKey: 'sat_open' },
      { label: 'Presupuestos SAT',     href: '/sat/presupuestos', icon: FileText },
      { label: 'Pedidos de trabajo',   href: '/sat/hojas',        icon: ClipboardList },
      { label: 'Albaranes de trabajo', href: '/sat/albaranes',    icon: Truck },
      { label: 'Activos en clientes',  href: '/sat/activos',      icon: Cpu },
      // Módulos técnicos Mocciaro (divider visual)
      { label: 'Repuestos',  href: '/sat/repuestos', icon: Box,       dividerBefore: true },
      { label: 'Modelos',    href: '/sat/modelos',   icon: Layers },
      { label: 'Manuales',   href: '/sat/manuales',  icon: BookOpen },
      { label: 'Lotes',      href: '/sat/lotes',     icon: Package },
      { label: 'Pausadas',   href: '/sat/pausadas',  icon: Pause },
      { label: 'Histórico',  href: '/sat/historico', icon: History },
    ],
  },
  {
    id: 'proyectos',
    label: 'Proyectos',
    href: '/workflows',
    icon: FolderKanban,
    matchPaths: [/^\/workflows($|\/)/],
    children: [
      { label: 'Proyectos', href: '/workflows', icon: FolderKanban },
    ],
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    href: '/ventas?tab=facturas',
    icon: CreditCard,
    requiredPermissions: ['view_financials'],
    matchPaths: [
      /^\/ventas\?tab=facturas/,
      /^\/ventas\?tab=notas/,
      /^\/ventas\?tab=cobros/,
      /^\/ventas\/recurrentes/,
      /^\/cobros/,
    ],
    children: [
      { label: 'Facturas',                    href: '/ventas?tab=facturas',                  icon: CreditCard },
      { label: 'Recibos de facturas',         href: '/cobros',                               icon: Banknote },
      { label: 'Facturas de abono',           href: '/ventas?tab=facturas&type=abono',       icon: Receipt },
      { label: 'Recibos de abono',            href: '/cobros?type=abono',                    icon: Wallet },
      { label: 'Facturas recurrentes',        href: '/ventas/recurrentes',                   icon: RefreshCw },
      { label: 'Libro de facturas emitidas',  href: '/ventas?tab=facturas&view=libro',       icon: BookText },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    href: '/compras?tab=proveedores',
    icon: ShoppingCart,
    requiredPermissions: ['create_purchase_order', 'view_suppliers'],
    matchPaths: [/^\/compras/],
    children: [
      { label: 'Proveedores',                 href: '/compras?tab=proveedores',         icon: Building2 },
      { label: 'Pedidos a proveedores',       href: '/compras?tab=pedidos',             icon: ShoppingCart, badgeKey: 'po_pending' },
      { label: 'Albaranes de proveedor',      href: '/compras?tab=recepciones',         icon: Truck },
      { label: 'Facturas de proveedor',       href: '/compras?tab=facturas',            icon: Receipt },
      { label: 'Recibos de proveedor',        href: '/compras?tab=pagos',               icon: Banknote },
      { label: 'Tickets y otros gastos',      href: '/gastos?context=compras',          icon: Receipt },
      { label: 'Libro de facturas recibidas', href: '/compras?tab=facturas&view=libro', icon: BookText },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    href: '/calendario',
    icon: Calendar,
    matchPaths: [/^\/calendario/],
    children: [
      { label: 'Calendario', href: '/calendario',             icon: Calendar },
      { label: 'Tareas',     href: '/calendario?view=tareas', icon: ClipboardList },
    ],
  },
  {
    id: 'informes',
    label: 'Informes',
    href: '/informes',
    icon: BarChart3,
    requiredPermissions: ['view_sales_reports', 'view_financials'],
    matchPaths: [/^\/informes/, /^\/dashboard\/ejecutivo/, /^\/dashboard-ejecutivo/],
    children: [
      { label: 'De un vistazo',        href: '/informes',                  icon: PieChart },
      { label: 'Facturación',          href: '/informes?tab=facturacion',  icon: CreditCard },
      { label: 'Tesorería',            href: '/informes?tab=tesoreria',    icon: Wallet },
      { label: 'Ventas',               href: '/informes?tab=ventas',       icon: TrendingUp },
      { label: 'SAT',                  href: '/informes?tab=sat',          icon: Wrench },
      { label: 'Compras',              href: '/informes?tab=compras',      icon: ShoppingCart },
      { label: 'Valoración de stock',  href: '/informes?tab=stock',        icon: Warehouse },
      { label: 'De evolución',         href: '/informes?tab=evolucion',    icon: TrendingUpDown },
      { label: 'Impuestos',            href: '/informes?tab=impuestos',    icon: Percent },
      // Extras Mocciaro
      { label: 'Dashboard ejecutivo',  href: '/dashboard/ejecutivo',       icon: Activity, dividerBefore: true },
      { label: 'Agente IA',            href: '/dashboard/ejecutivo?ai=1',  icon: Bot },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Menú grilla "Más" (icono ⊞ a la derecha del top nav)
// 2 bloques estilo StelOrder
// ─────────────────────────────────────────────────────────────────────────────

export const moreSection: {
  label: string
  groups: Array<{ title: string; items: NavLeaf[] }>
} = {
  label: 'Más',
  groups: [
    {
      title: 'Tus funcionalidades',
      items: [
        { label: 'Stock',              href: '/stock',              icon: Warehouse,    requiredPermissions: ['view_stock'] },
        { label: 'Mail',               href: '/mail',               icon: Mail },
        { label: 'Automatizaciones',   href: '/automatizaciones',   icon: Zap,          requiredPermissions: ['admin_users'] },
        { label: 'WhatsApp Business',  href: '/whatsapp',           icon: MessageCircle, requiredPermissions: ['admin_users'] },
        { label: 'Workflows técnico',  href: '/workflows-tecnico',  icon: Workflow },
        { label: 'Hub IA',             href: '/hub-ia',             icon: Sparkles },
        { label: 'Scanner',            href: '/scanner',            icon: ScanLine },
        { label: 'Finanzas',           href: '/finanzas',           icon: TrendingUp,   requiredPermissions: ['view_financials'] },
      ],
    },
    {
      title: 'Funcionalidades adicionales',
      items: [
        { label: 'Admin',                href: '/admin',                       icon: Settings, requiredPermissions: ['admin_users'] },
        { label: 'Multi-empresa',        href: '/admin?tab=empresas',          icon: Briefcase, requiredPermissions: ['admin_users'] },
        { label: 'Productos compuestos', href: '/catalogo?tab=compuestos',     icon: Boxes },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown de usuario (avatar + ▼)
// ─────────────────────────────────────────────────────────────────────────────

export const userDropdown: UserDropdownItem[] = [
  { label: 'Mi perfil',          href: '/admin?tab=perfil',          icon: User },
  { label: 'Mi Mocciaro Soft',   href: '/admin',                     icon: Settings },
  { label: 'Configuración',      href: '/admin?tab=config',          icon: Lock },
  { label: 'Funcionalidades',    href: '/admin?tab=funcionalidades', icon: Grid3X3 },
  { label: 'Acceso asesor',      href: '/admin?tab=asesor',          icon: Briefcase },
  { label: 'Centro de ayuda',    action: 'help',                     icon: HelpCircle,  dividerBefore: true },
  { label: 'Atajos de teclado',  action: 'shortcuts',                icon: Keyboard },
  { label: 'Cerrar sesión',      action: 'logout',                   icon: LogOut,      dividerBefore: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// Bottom nav mobile
// ─────────────────────────────────────────────────────────────────────────────

export const mobileBottomSections: Array<{ id: string; label: string; href: string; icon: typeof LayoutDashboard }> = [
  { id: 'inicio',   label: 'Inicio',   href: '/inicio',              icon: LayoutDashboard },
  { id: 'ventas',   label: 'Ventas',   href: '/cotizador',           icon: FileText },
  { id: 'clientes', label: 'Clientes', href: '/clientes',            icon: Users },
  { id: 'compras',  label: 'Compras',  href: '/compras?tab=pedidos', icon: ShoppingCart },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve la sección activa según la URL actual.
 * `search` (window.location.search) se concatena al pathname para que las
 * regex de matchPaths puedan distinguir /ventas?tab=facturas vs /ventas?tab=pedidos.
 */
export function findActiveSection(pathname: string, search: string = ''): NavSection | null {
  const full = pathname + (search || '')
  for (const section of navSections) {
    if (section.matchPaths?.some(rx => rx.test(full))) return section
  }
  for (const section of navSections) {
    if (pathname === section.href.split('?')[0]) return section
  }
  return null
}
