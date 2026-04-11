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
  Save, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Shield
} from 'lucide-react'

type Row = Record<string, unknown>

const ROLES = ['admin', 'vendedor', 'tecnico', 'viewer']
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
  const [editUser, setEditUser] = useState<Row | null>(null)
  const [editUserRole, setEditUserRole] = useState('')

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
    const { data } = await supabase.from('tt_users').select('*').order('name')
    setUsersData(data || [])
    setLoadingUsers(false)
  }, [supabase])

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
    ;(data || []).forEach((p: Row) => { edits[p.id as string] = (p.value as string) || '' })
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
    if (tab === 'users') loadUsers()
    if (tab === 'companies') loadCompanies()
    if (tab === 'params') loadParams()
    if (tab === 'warehouses') loadWarehouses()
    if (tab === 'audit') loadAudit()
    if (tab === 'permissions') loadPermissions()
  }

  useEffect(() => { loadUsers() }, [loadUsers])

  const saveUserRole = async () => {
    if (!editUser) return
    await supabase.from('tt_users').update({ role: editUserRole }).eq('id', editUser.id)
    addToast({ type: 'success', title: 'Rol actualizado' })
    setEditUser(null)
    loadUsers()
  }

  const openEditCompany = (c: Row) => {
    setEditCompany(c)
    setCompanyForm({
      name: (c.name as string) || '',
      tax_id: (c.tax_id as string) || '',
      currency: (c.currency as string) || 'EUR',
      address: (c.address as string) || '',
      bank_details: (c.bank_details as string) || '',
      tax_rate: String((c.tax_rate as number) || 0),
      default_margin: String((c.default_margin as number) || 0),
    })
  }

  const saveCompany = async () => {
    if (!editCompany) return
    await supabase.from('tt_companies').update({
      name: companyForm.name,
      tax_id: companyForm.tax_id,
      currency: companyForm.currency,
      address: companyForm.address,
      bank_details: companyForm.bank_details,
      tax_rate: Number(companyForm.tax_rate),
      default_margin: Number(companyForm.default_margin),
    }).eq('id', editCompany.id)
    addToast({ type: 'success', title: 'Empresa actualizada' })
    setEditCompany(null)
    loadCompanies()
  }

  const saveParams = async () => {
    for (const [id, value] of Object.entries(paramEdits)) {
      await supabase.from('tt_system_params').update({ value }).eq('id', id)
    }
    addToast({ type: 'success', title: 'Parámetros guardados' })
  }

  const addWarehouse = async () => {
    if (!newWarehouse.name.trim()) return
    await supabase.from('tt_warehouses').insert({ name: newWarehouse.name, location: newWarehouse.location || null })
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
                  <CardTitle>Usuarios</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingUsers ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Último acceso</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersData.map((u) => (
                          <TableRow key={u.id as string}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#FF6600] flex items-center justify-center text-white text-xs font-bold">
                                  {getInitials((u.name as string) || 'U')}
                                </div>
                                <span className="text-sm font-medium text-[#F0F2F5]">{(u.name as string) || '-'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-[#9CA3AF]">{(u.email as string) || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={(u.role as string) === 'admin' ? 'orange' : 'default'}>
                                {(u.role as string) || 'user'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-[#6B7280]">
                              {u.last_login ? formatRelative(u.last_login as string) : 'Nunca'}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setEditUserRole((u.role as string) || '') }}>
                                <Edit size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                            <div><p className="text-[10px] text-[#6B7280]">Moneda</p><p className="text-[#D1D5DB]">{(c.currency as string) || '-'}</p></div>
                            <div><p className="text-[10px] text-[#6B7280]">IVA</p><p className="text-[#D1D5DB]">{c.tax_rate ? `${c.tax_rate}%` : '-'}</p></div>
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
                            key={p.id as string}
                            label={`${(p.key as string) || ''} ${(p.description as string) ? `(${p.description})` : ''}`}
                            value={paramEdits[p.id as string] || ''}
                            onChange={(e) => setParamEdits({ ...paramEdits, [p.id as string]: e.target.value })}
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
                            <TableCell className="text-[#9CA3AF]">{(w.location as string) || '-'}</TableCell>
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

      {/* ─── EDIT USER ROLE ─── */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} title="Editar usuario" size="sm">
        {editUser && (
          <div className="space-y-4">
            <p className="text-sm text-[#D1D5DB]">{(editUser.name as string) || ''} ({(editUser.email as string) || ''})</p>
            <Select
              label="Rol"
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'vendedor', label: 'Vendedor' },
                { value: 'tecnico', label: 'Técnico' },
                { value: 'viewer', label: 'Solo lectura' },
              ]}
              value={editUserRole}
              onChange={(e) => setEditUserRole(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditUser(null)}>Cancelar</Button>
              <Button onClick={saveUserRole}><Save size={14} /> Guardar</Button>
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
              <Input label="Moneda" value={companyForm.currency || ''} onChange={(e) => setCompanyForm({ ...companyForm, currency: e.target.value })} />
              <Input label="Tasa IVA (%)" type="number" value={companyForm.tax_rate || ''} onChange={(e) => setCompanyForm({ ...companyForm, tax_rate: e.target.value })} />
              <Input label="Margen por defecto (%)" type="number" value={companyForm.default_margin || ''} onChange={(e) => setCompanyForm({ ...companyForm, default_margin: e.target.value })} />
            </div>
            <Input label="Dirección" value={companyForm.address || ''} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Datos bancarios</label>
              <textarea
                value={companyForm.bank_details || ''}
                onChange={(e) => setCompanyForm({ ...companyForm, bank_details: e.target.value })}
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
