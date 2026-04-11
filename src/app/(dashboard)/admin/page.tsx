'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Tabs } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { SearchBar } from '@/components/ui/search-bar'
import { useToast } from '@/components/ui/toast'
import { formatDate, formatDateTime, formatRelative, getInitials } from '@/lib/utils'
import {
  Settings, Users, Building2, Sliders, Warehouse, Activity,
  Save, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Shield,
  UserPlus, Power, Copy, Eye, EyeOff, Check
} from 'lucide-react'

type Row = Record<string, unknown>

const ROLES = ['admin', 'vendedor', 'tecnico', 'viewer']
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  tecnico: 'Tecnico',
  viewer: 'Solo lectura',
}

const ALL_PERMISSIONS = [
  { key: 'quote', label: 'Cotizaciones', group: 'Ventas' },
  { key: 'catalog', label: 'Catalogo', group: 'Productos' },
  { key: 'stock', label: 'Stock', group: 'Productos' },
  { key: 'clients', label: 'Clientes', group: 'CRM' },
  { key: 'crm', label: 'CRM / Pipeline', group: 'CRM' },
  { key: 'sat', label: 'SAT / Servicio tecnico', group: 'Operaciones' },
  { key: 'purchases', label: 'Compras', group: 'Operaciones' },
  { key: 'sales', label: 'Ventas', group: 'Ventas' },
  { key: 'reports', label: 'Reportes', group: 'Admin' },
  { key: 'admin', label: 'Administracion', group: 'Admin' },
  { key: 'edit_users', label: 'Editar usuarios', group: 'Admin' },
  { key: 'edit_params', label: 'Editar parametros', group: 'Admin' },
  { key: 'see_costs', label: 'Ver costos', group: 'Finanzas' },
  { key: 'see_markup', label: 'Ver markup', group: 'Finanzas' },
  { key: 'edit_prices', label: 'Editar precios', group: 'Finanzas' },
  { key: 'edit_stock', label: 'Editar stock', group: 'Productos' },
  { key: 'edit_clients', label: 'Editar clientes', group: 'CRM' },
  { key: 'export', label: 'Exportar datos', group: 'Admin' },
]

const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, true])),
  vendedor: { quote: true, catalog: true, stock: false, clients: true, crm: true, sat: false, purchases: false, sales: true, reports: true, admin: false, edit_users: false, edit_params: false, see_costs: false, see_markup: true, edit_prices: false, edit_stock: false, edit_clients: true, export: true },
  tecnico: { quote: false, catalog: true, stock: true, clients: false, crm: false, sat: true, purchases: false, sales: false, reports: false, admin: false, edit_users: false, edit_params: false, see_costs: false, see_markup: false, edit_prices: false, edit_stock: true, edit_clients: false, export: false },
  viewer: { quote: false, catalog: true, stock: false, clients: true, crm: true, sat: false, purchases: false, sales: false, reports: true, admin: false, edit_users: false, edit_params: false, see_costs: false, see_markup: false, edit_prices: false, edit_stock: false, edit_clients: false, export: false },
}

// Backwards compat: old permissions list for the matrix tab
const PERMISSIONS = [
  { key: 'ver_precios', label: 'Ver precios' },
  { key: 'editar_stock', label: 'Editar stock' },
  { key: 'crear_cotizaciones', label: 'Crear cotizaciones' },
  { key: 'crear_pedidos', label: 'Crear pedidos' },
  { key: 'crear_facturas', label: 'Crear facturas' },
  { key: 'gestionar_clientes', label: 'Gestionar clientes' },
  { key: 'gestionar_sat', label: 'Gestionar SAT' },
  { key: 'ver_reportes', label: 'Ver reportes' },
  { key: 'admin_sistema', label: 'Admin sistema' },
]

const DEFAULT_MATRIX: Record<string, Record<string, boolean>> = {
  admin: { ver_precios: true, editar_stock: true, crear_cotizaciones: true, crear_pedidos: true, crear_facturas: true, gestionar_clientes: true, gestionar_sat: true, ver_reportes: true, admin_sistema: true },
  vendedor: { ver_precios: true, editar_stock: false, crear_cotizaciones: true, crear_pedidos: true, crear_facturas: false, gestionar_clientes: true, gestionar_sat: false, ver_reportes: true, admin_sistema: false },
  tecnico: { ver_precios: false, editar_stock: true, crear_cotizaciones: false, crear_pedidos: false, crear_facturas: false, gestionar_clientes: false, gestionar_sat: true, ver_reportes: false, admin_sistema: false },
  viewer: { ver_precios: true, editar_stock: false, crear_cotizaciones: false, crear_pedidos: false, crear_facturas: false, gestionar_clientes: false, gestionar_sat: false, ver_reportes: true, admin_sistema: false },
}

// Empty user form
interface UserForm {
  username: string
  full_name: string
  email: string
  role: string
  gmail: string
  whatsapp: string
  phone: string
  company_id: string
  active: boolean
  permissions: Record<string, boolean>
}

function emptyUserForm(): UserForm {
  return {
    username: '', full_name: '', email: '', role: 'vendedor',
    gmail: '', whatsapp: '', phone: '', company_id: '', active: true,
    permissions: { ...DEFAULT_ROLE_PERMISSIONS['vendedor'] },
  }
}

const tabs = [
  { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
  { id: 'companies', label: 'Empresas', icon: <Building2 size={16} /> },
  { id: 'params', label: 'Parametros', icon: <Sliders size={16} /> },
  { id: 'warehouses', label: 'Almacenes', icon: <Warehouse size={16} /> },
  { id: 'audit', label: 'Auditoria', icon: <Activity size={16} /> },
  { id: 'permissions', label: 'Permisos', icon: <Shield size={16} /> },
]

export default function AdminPage() {
  const supabase = createClient()
  const { addToast } = useToast()

  // Users
  const [usersData, setUsersData] = useState<Row[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm())
  const [savingUser, setSavingUser] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  // Companies
  const [companies, setCompanies] = useState<Row[]>([])
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [editCompany, setEditCompany] = useState<Row | null>(null)
  const [companyForm, setCompanyForm] = useState<Record<string, string>>({})

  // Params
  const [params, setParams] = useState<Row[]>([])
  const [loadingParams, setLoadingParams] = useState(false)
  const [paramEdits, setParamEdits] = useState<Record<string, string>>({})

  // Warehouses
  const [warehouses, setWarehouses] = useState<Row[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [newWarehouse, setNewWarehouse] = useState({ name: '', location: '' })

  // Audit
  const [auditLogs, setAuditLogs] = useState<Row[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditEntityFilter, setAuditEntityFilter] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const AUDIT_PAGE_SIZE = 20

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    const { data } = await supabase.from('tt_users').select('*').order('full_name')
    setUsersData(data || [])
    setLoadingUsers(false)
  }, [supabase])

  const openNewUser = () => {
    setEditingUserId(null)
    setUserForm(emptyUserForm())
    setGeneratedPassword(null)
    setShowPassword(false)
    setShowUserModal(true)
  }

  const openEditUser = (u: Row) => {
    setEditingUserId(u.id as string)
    const perms = (u.permissions && typeof u.permissions === 'object') ? u.permissions as Record<string, boolean> : {}
    setUserForm({
      username: (u.username as string) || '',
      full_name: (u.full_name as string) || '',
      email: (u.email as string) || '',
      role: (u.role as string) || 'viewer',
      gmail: (u.gmail as string) || '',
      whatsapp: (u.whatsapp as string) || '',
      phone: (u.phone as string) || '',
      company_id: (u.company_id as string) || '',
      active: u.active !== false,
      permissions: { ...DEFAULT_ROLE_PERMISSIONS[(u.role as string) || 'viewer'], ...perms },
    })
    setGeneratedPassword(null)
    setShowPassword(false)
    setShowUserModal(true)
  }

  const handleRoleChange = (role: string) => {
    setUserForm(prev => ({
      ...prev,
      role,
      permissions: { ...DEFAULT_ROLE_PERMISSIONS[role] || {} },
    }))
  }

  const toggleUserPermission = (key: string) => {
    setUserForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }))
  }

  const saveUser = async () => {
    if (!userForm.username.trim() || !userForm.full_name.trim() || !userForm.email.trim()) {
      addToast({ type: 'warning', title: 'Completa los campos obligatorios' })
      return
    }
    setSavingUser(true)
    try {
      if (editingUserId) {
        // Update existing user
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUserId, ...userForm }),
        })
        const result = await res.json()
        if (!res.ok) {
          addToast({ type: 'error', title: 'Error', message: result.error })
        } else {
          addToast({ type: 'success', title: 'Usuario actualizado' })
          setShowUserModal(false)
          loadUsers()
        }
      } else {
        // Create new user
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        })
        const result = await res.json()
        if (!res.ok) {
          addToast({ type: 'error', title: 'Error', message: result.error })
        } else {
          setGeneratedPassword(result.generated_password || null)
          addToast({ type: 'success', title: 'Usuario creado correctamente' })
          loadUsers()
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error de red', message: (err as Error).message })
    } finally {
      setSavingUser(false)
    }
  }

  const deactivateUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${userId}`, { method: 'DELETE' })
      const result = await res.json()
      if (!res.ok) {
        addToast({ type: 'error', title: 'Error', message: result.error })
      } else {
        addToast({ type: 'success', title: 'Usuario desactivado' })
        loadUsers()
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: (err as Error).message })
    }
  }

  const filteredUsers = usersData.filter(u => {
    if (!userSearch) return true
    const s = userSearch.toLowerCase()
    return (
      ((u.full_name as string) || '').toLowerCase().includes(s) ||
      ((u.email as string) || '').toLowerCase().includes(s) ||
      ((u.username as string) || '').toLowerCase().includes(s)
    )
  })

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true)
    const { data } = await supabase.from('tt_companies').select('*').order('name')
    setCompanies(data || [])
    setLoadingCompanies(false)
  }, [supabase])

  const loadParams = useCallback(async () => {
    setLoadingParams(true)
    const { data } = await supabase.from('tt_system_params').select('*').order('key')
    setParams(data || [])
    const edits: Record<string, string> = {}
    ;(data || []).forEach((p: Row) => { edits[p.key as string] = (p.value as string) || '' })
    setParamEdits(edits)
    setLoadingParams(false)
  }, [supabase])

  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true)
    const { data } = await supabase.from('tt_warehouses').select('*').order('name')
    setWarehouses(data || [])
    setLoadingWarehouses(false)
  }, [supabase])

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true)
    let q = supabase
      .from('tt_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE - 1)

    if (auditEntityFilter) q = q.eq('entity_type', auditEntityFilter)

    const { data } = await q
    setAuditLogs(data || [])
    setLoadingAudit(false)
  }, [supabase, auditPage, auditEntityFilter])

  // Permissions
  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>(DEFAULT_MATRIX)
  const [savingPerms, setSavingPerms] = useState(false)

  const togglePerm = (role: string, perm: string) => {
    setPermMatrix(prev => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role]?.[perm] }
    }))
  }

  const savePermissions = async () => {
    setSavingPerms(true)
    // Save to system params as JSON
    await supabase.from('tt_system_params').upsert({
      key: 'role_permissions',
      value: JSON.stringify(permMatrix),
      description: 'Matriz de permisos por rol',
    }, { onConflict: 'key' })
    addToast({ type: 'success', title: 'Permisos guardados' })
    setSavingPerms(false)
  }

  const loadPermissions = useCallback(async () => {
    const { data } = await supabase.from('tt_system_params').select('value').eq('key', 'role_permissions').single()
    if (data?.value) {
      try { setPermMatrix(JSON.parse(data.value as string)) } catch { /* keep defaults */ }
    }
  }, [supabase])

  const handleTabChange = (tab: string) => {
    if (tab === 'users') { loadUsers(); loadCompanies() }
    if (tab === 'companies') loadCompanies()
    if (tab === 'params') loadParams()
    if (tab === 'warehouses') loadWarehouses()
    if (tab === 'audit') loadAudit()
    if (tab === 'permissions') loadPermissions()
  }

  useEffect(() => { loadUsers(); loadCompanies() }, [loadUsers, loadCompanies])

  // saveUserRole removed - replaced by full user management modal

  const openEditCompany = (c: Row) => {
    setEditCompany(c)
    setCompanyForm({
      name: (c.name as string) || '',
      tax_id: (c.tax_id as string) || '',
      country: (c.country as string) || '',
      address: (c.address as string) || '',
      iban: (c.iban as string) || '',
      default_tax_rate: String((c.default_tax_rate as number) || 0),
      default_margin: String((c.default_margin as number) || 0),
    })
  }

  const saveCompany = async () => {
    if (!editCompany) return
    await supabase.from('tt_companies').update({
      name: companyForm.name,
      tax_id: companyForm.tax_id,
      country: companyForm.country,
      address: companyForm.address,
      iban: companyForm.iban,
      default_tax_rate: Number(companyForm.default_tax_rate),
      default_margin: Number(companyForm.default_margin),
    }).eq('id', editCompany.id)
    addToast({ type: 'success', title: 'Empresa actualizada' })
    setEditCompany(null)
    loadCompanies()
  }

  const saveParams = async () => {
    for (const [key, value] of Object.entries(paramEdits)) {
      await supabase.from('tt_system_params').update({ value }).eq('key', key)
    }
    addToast({ type: 'success', title: 'Parámetros guardados' })
  }

  const addWarehouse = async () => {
    if (!newWarehouse.name.trim()) return
    await supabase.from('tt_warehouses').insert({ name: newWarehouse.name, city: newWarehouse.location || null, active: true })
    addToast({ type: 'success', title: 'Almacén creado' })
    setShowAddWarehouse(false)
    setNewWarehouse({ name: '', location: '' })
    loadWarehouses()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Administración</h1>
        <p className="text-sm text-[#6B7280] mt-1">Configuracion del sistema, usuarios y auditoria</p>
      </div>

      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={32} /></div>}>
      <Tabs tabs={tabs} defaultTab="users" onChange={handleTabChange}>
        {(activeTab) => (
          <>
            {/* ═══ USERS ═══ */}
            {activeTab === 'users' && (
              <Card>
                <CardHeader>
                  <CardTitle>Usuarios del sistema</CardTitle>
                  <Button size="sm" onClick={openNewUser}><UserPlus size={14} /> Nuevo usuario</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SearchBar placeholder="Buscar usuario..." value={userSearch} onChange={setUserSearch} />
                  {loadingUsers ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-10 text-[#6B7280]">
                      <Users size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No se encontraron usuarios</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Rol</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Ultima actualizacion</TableHead>
                            <TableHead>Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredUsers.map((u) => (
                            <TableRow key={u.id as string}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.active === false ? 'bg-[#4B5563]' : 'bg-[#FF6600]'}`}>
                                    {getInitials((u.full_name as string) || 'U')}
                                  </div>
                                  <span className={`text-sm font-medium ${u.active === false ? 'text-[#6B7280] line-through' : 'text-[#F0F2F5]'}`}>
                                    {(u.full_name as string) || '-'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-[#9CA3AF]">{(u.username as string) || '-'}</TableCell>
                              <TableCell className="text-sm text-[#9CA3AF]">{(u.email as string) || '-'}</TableCell>
                              <TableCell>
                                <Badge variant={(u.role as string) === 'admin' ? 'orange' : (u.role as string) === 'vendedor' ? 'info' : (u.role as string) === 'tecnico' ? 'warning' : 'default'}>
                                  {ROLE_LABELS[(u.role as string)] || (u.role as string) || 'viewer'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={u.active !== false ? 'success' : 'danger'}>
                                  {u.active !== false ? 'Activo' : 'Inactivo'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-[#6B7280]">
                                {u.updated_at ? formatRelative(u.updated_at as string) : 'Nunca'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEditUser(u)} title="Editar">
                                    <Edit size={14} />
                                  </Button>
                                  {u.active !== false && (
                                    <Button variant="ghost" size="sm" onClick={() => deactivateUser(u.id as string)} title="Desactivar">
                                      <Power size={14} className="text-red-400" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ═══ COMPANIES ═══ */}
            {activeTab === 'companies' && (
              <Card>
                <CardHeader>
                  <CardTitle>Empresas del grupo</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingCompanies ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : companies.length === 0 ? (
                    <p className="text-sm text-[#6B7280] text-center py-10">No hay empresas cargadas</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {companies.map((c) => (
                        <div key={c.id as string} className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] hover:border-[#2A3040] transition-all">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-[#F0F2F5]">{(c.name as string) || '-'}</h3>
                            <Badge variant="success">Activa</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div><p className="text-[10px] text-[#6B7280]">CIF/CUIT</p><p className="text-[#D1D5DB]">{(c.tax_id as string) || '-'}</p></div>
                            <div><p className="text-[10px] text-[#6B7280]">Pais</p><p className="text-[#D1D5DB]">{(c.country as string) || '-'}</p></div>
                            <div><p className="text-[10px] text-[#6B7280]">IVA</p><p className="text-[#D1D5DB]">{c.default_tax_rate ? `${c.default_tax_rate}%` : '-'}</p></div>
                          </div>
                          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => openEditCompany(c)}>
                            <Edit size={14} /> Configurar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ═══ PARAMS ═══ */}
            {activeTab === 'params' && (
              <Card>
                <CardHeader>
                  <CardTitle>Parámetros del sistema</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingParams ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : params.length === 0 ? (
                    <p className="text-sm text-[#6B7280] text-center py-10">No hay parámetros configurados</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {params.map((p) => (
                          <Input
                            key={p.key as string}
                            label={`${(p.key as string) || ''} ${(p.description as string) ? `(${p.description})` : ''}`}
                            value={paramEdits[p.key as string] || ''}
                            onChange={(e) => setParamEdits({ ...paramEdits, [p.key as string]: e.target.value })}
                          />
                        ))}
                      </div>
                      <Button onClick={saveParams}><Save size={14} /> Guardar</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ═══ WAREHOUSES ═══ */}
            {activeTab === 'warehouses' && (
              <Card>
                <CardHeader>
                  <CardTitle>Almacenes</CardTitle>
                  <Button size="sm" onClick={() => setShowAddWarehouse(true)}><Plus size={14} /> Nuevo</Button>
                </CardHeader>
                <CardContent>
                  {loadingWarehouses ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : warehouses.length === 0 ? (
                    <p className="text-sm text-[#6B7280] text-center py-10">No hay almacenes</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Ubicación</TableHead>
                          <TableHead>Creado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {warehouses.map((w) => (
                          <TableRow key={w.id as string}>
                            <TableCell><span className="font-medium text-[#F0F2F5]">{(w.name as string) || '-'}</span></TableCell>
                            <TableCell className="text-[#9CA3AF]">{(w.city as string) || (w.country as string) || '-'}</TableCell>
                            <TableCell className="text-sm">{w.created_at ? formatDate(w.created_at as string) : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ═══ PERMISSIONS ═══ */}
            {activeTab === 'permissions' && (
              <Card>
                <CardHeader>
                  <CardTitle>Permisos por rol</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#1E2330]">
                          <th className="text-left text-sm font-medium text-[#9CA3AF] p-3">Permiso</th>
                          {ROLES.map(role => (
                            <th key={role} className="text-center text-sm font-medium text-[#9CA3AF] p-3 capitalize">{role}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSIONS.map(perm => (
                          <tr key={perm.key} className="border-b border-[#1E2330]/50 hover:bg-[#0F1218]">
                            <td className="text-sm text-[#F0F2F5] p-3">{perm.label}</td>
                            {ROLES.map(role => (
                              <td key={role} className="text-center p-3">
                                <button
                                  onClick={() => togglePerm(role, perm.key)}
                                  className={`w-6 h-6 rounded border-2 transition-all ${
                                    permMatrix[role]?.[perm.key]
                                      ? 'bg-[#FF6600] border-[#FF6600]'
                                      : 'bg-transparent border-[#2A3040] hover:border-[#4B5563]'
                                  }`}
                                >
                                  {permMatrix[role]?.[perm.key] && (
                                    <svg className="w-4 h-4 text-white mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                  )}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button onClick={savePermissions} loading={savingPerms}><Save size={14} /> Guardar permisos</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ═══ AUDIT ═══ */}
            {activeTab === 'audit' && (
              <Card>
                <CardHeader>
                  <CardTitle>Log de auditoria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3">
                    <Select
                      options={[
                        { value: '', label: 'Todas las entidades' },
                        { value: 'quote', label: 'Cotización' },
                        { value: 'sales_order', label: 'Pedido venta' },
                        { value: 'purchase_order', label: 'OC' },
                        { value: 'delivery_note', label: 'Remito' },
                        { value: 'invoice', label: 'Factura' },
                        { value: 'sat_ticket', label: 'SAT' },
                        { value: 'client', label: 'Cliente' },
                        { value: 'product', label: 'Producto' },
                      ]}
                      value={auditEntityFilter}
                      onChange={(e) => { setAuditEntityFilter(e.target.value); setAuditPage(0) }}
                      className="w-48"
                    />
                    <Button variant="secondary" size="sm" onClick={loadAudit}><Activity size={14} /> Refrescar</Button>
                  </div>

                  {loadingAudit ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : auditLogs.length === 0 ? (
                    <p className="text-sm text-[#6B7280] text-center py-10">No hay registros</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Entidad</TableHead>
                          <TableHead>Acción</TableHead>
                          <TableHead>Detalle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id as string}>
                            <TableCell className="text-xs whitespace-nowrap">{log.created_at ? formatDateTime(log.created_at as string) : '-'}</TableCell>
                            <TableCell><Badge variant="default">{(log.entity_type as string) || '-'}</Badge></TableCell>
                            <TableCell className="text-sm text-[#F0F2F5]">{(log.action as string) || '-'}</TableCell>
                            <TableCell className="text-sm text-[#9CA3AF] max-w-[300px] truncate">{(log.detail as string) || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <div className="flex justify-between items-center">
                    <Button variant="ghost" size="sm" disabled={auditPage === 0} onClick={() => { setAuditPage(auditPage - 1); loadAudit() }}>
                      <ChevronLeft size={14} /> Anterior
                    </Button>
                    <span className="text-xs text-[#6B7280]">Página {auditPage + 1}</span>
                    <Button variant="ghost" size="sm" disabled={auditLogs.length < AUDIT_PAGE_SIZE} onClick={() => { setAuditPage(auditPage + 1); loadAudit() }}>
                      Siguiente <ChevronRight size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Tabs>
      </Suspense>

      {/* ─── CREATE / EDIT USER MODAL ─── */}
      <Modal
        isOpen={showUserModal}
        onClose={() => { if (!generatedPassword) setShowUserModal(false) }}
        title={generatedPassword ? 'Usuario creado' : editingUserId ? 'Editar usuario' : 'Nuevo usuario'}
        size="xl"
      >
        {generatedPassword ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Check size={18} className="text-emerald-400" />
                <p className="text-sm font-medium text-emerald-400">Usuario creado correctamente</p>
              </div>
              <p className="text-xs text-[#9CA3AF] mb-3">Se genero una contrasena temporal. Copiala y enviasela al usuario para su primer inicio de sesion.</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#0F1218] border border-[#2A3040]">
                <code className="flex-1 text-sm text-[#F0F2F5] font-mono">
                  {showPassword ? generatedPassword : '••••••••••••••••'}
                </code>
                <Button variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  navigator.clipboard.writeText(generatedPassword)
                  addToast({ type: 'success', title: 'Contrasena copiada al portapapeles' })
                }}>
                  <Copy size={14} />
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { setShowUserModal(false); setGeneratedPassword(null) }}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre completo *"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                placeholder="Juan Perez"
              />
              <Input
                label="Username *"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                placeholder="jperez"
              />
              <Input
                label="Email *"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="juan@torquetools.es"
              />
              <Select
                label="Rol"
                options={ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))}
                value={userForm.role}
                onChange={(e) => handleRoleChange(e.target.value)}
              />
            </div>

            {/* Contact info */}
            <div>
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">Contacto</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Gmail (Google Chat)"
                  value={userForm.gmail}
                  onChange={(e) => setUserForm({ ...userForm, gmail: e.target.value })}
                  placeholder="juan@gmail.com"
                />
                <Input
                  label="WhatsApp"
                  value={userForm.whatsapp}
                  onChange={(e) => setUserForm({ ...userForm, whatsapp: e.target.value })}
                  placeholder="+34 600 000 000"
                />
                <Input
                  label="Telefono"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  placeholder="+34 900 000 000"
                />
              </div>
            </div>

            {/* Company & status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Empresa"
                options={[{ value: '', label: 'Sin asignar' }, ...companies.map(c => ({ value: (c.id as string), label: (c.name as string) || '-' }))]}
                value={userForm.company_id}
                onChange={(e) => setUserForm({ ...userForm, company_id: e.target.value })}
              />
              <div>
                <p className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Estado</p>
                <button
                  onClick={() => setUserForm({ ...userForm, active: !userForm.active })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    userForm.active
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  <Power size={14} />
                  <span className="text-sm font-medium">{userForm.active ? 'Activo' : 'Inactivo'}</span>
                </button>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">
                Permisos granulares
                <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">
                  (se cargan los defaults del rol seleccionado)
                </span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {ALL_PERMISSIONS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => toggleUserPermission(p.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                      userForm.permissions[p.key]
                        ? 'bg-[#FF6600]/10 border-[#FF6600]/30 text-[#FF6600]'
                        : 'bg-[#0F1218] border-[#1E2330] text-[#6B7280] hover:border-[#2A3040]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                      userForm.permissions[p.key]
                        ? 'bg-[#FF6600] border-[#FF6600]'
                        : 'border-[#2A3040]'
                    }`}>
                      {userForm.permissions[p.key] && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setShowUserModal(false)}>Cancelar</Button>
              <Button onClick={saveUser} loading={savingUser}>
                <Save size={14} /> {editingUserId ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── EDIT COMPANY ─── */}
      <Modal isOpen={!!editCompany} onClose={() => setEditCompany(null)} title="Configurar empresa" size="lg">
        {editCompany && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nombre" value={companyForm.name || ''} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
              <Input label="CIF / CUIT" value={companyForm.tax_id || ''} onChange={(e) => setCompanyForm({ ...companyForm, tax_id: e.target.value })} />
              <Input label="Pais" value={companyForm.country || ''} onChange={(e) => setCompanyForm({ ...companyForm, country: e.target.value })} />
              <Input label="Tasa IVA (%)" type="number" value={companyForm.default_tax_rate || ''} onChange={(e) => setCompanyForm({ ...companyForm, default_tax_rate: e.target.value })} />
              <Input label="Margen por defecto (%)" type="number" value={companyForm.default_margin || ''} onChange={(e) => setCompanyForm({ ...companyForm, default_margin: e.target.value })} />
            </div>
            <Input label="Dirección" value={companyForm.address || ''} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">IBAN</label>
              <textarea
                value={companyForm.iban || ''}
                onChange={(e) => setCompanyForm({ ...companyForm, iban: e.target.value })}
                className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2330]">
              <Button variant="secondary" onClick={() => setEditCompany(null)}>Cancelar</Button>
              <Button onClick={saveCompany}><Save size={14} /> Guardar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── ADD WAREHOUSE ─── */}
      <Modal isOpen={showAddWarehouse} onClose={() => setShowAddWarehouse(false)} title="Nuevo almacén" size="sm">
        <div className="space-y-4">
          <Input label="Nombre" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} placeholder="Almacén principal" />
          <Input label="Ubicación" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} placeholder="Madrid, España" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddWarehouse(false)}>Cancelar</Button>
            <Button onClick={addWarehouse}><Plus size={14} /> Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
