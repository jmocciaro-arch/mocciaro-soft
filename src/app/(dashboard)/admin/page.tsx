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
import { ExportButton } from '@/components/ui/export-button'
import {
  Settings, Users, Building2, Sliders, Warehouse, Activity,
  Save, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Shield,
  UserPlus, Power, Copy, Eye, EyeOff, Check, ShieldCheck, X
} from 'lucide-react'

type Row = Record<string, unknown>

// Legacy roles for backward compat with old tt_users.role field
const LEGACY_ROLES = ['admin', 'vendedor', 'tecnico', 'viewer']
const LEGACY_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  tecnico: 'Tecnico',
  viewer: 'Solo lectura',
}

// ─── Types for RBAC ───
interface RbacRole {
  id: string
  name: string
  label: string
  category: string
  description: string | null
  active: boolean
}

interface RbacPermission {
  id: string
  name: string
  label: string
  module: string
}

interface RbacTeam {
  id: string
  name: string
  label: string
  active: boolean
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
  // RBAC
  rbac_role_ids: string[]
  rbac_team_ids: string[]
}

function emptyUserForm(): UserForm {
  return {
    username: '', full_name: '', email: '', role: 'vendedor',
    gmail: '', whatsapp: '', phone: '', company_id: '', active: true,
    permissions: {},
    rbac_role_ids: [],
    rbac_team_ids: [],
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  internal: 'Interno',
  external_client: 'Cliente externo',
  external_supplier: 'Proveedor externo',
}

const MODULE_LABELS: Record<string, string> = {
  ventas: 'Ventas',
  compras: 'Compras',
  stock: 'Stock / Deposito',
  finanzas: 'Finanzas',
  admin: 'Administracion',
  catalogo: 'Catalogo',
  crm: 'CRM',
  sat: 'SAT',
}

const tabs = [
  { id: 'users', label: 'Usuarios', icon: <Users size={16} /> },
  { id: 'roles', label: 'Roles', icon: <Shield size={16} /> },
  { id: 'companies', label: 'Empresas', icon: <Building2 size={16} /> },
  { id: 'params', label: 'Parametros', icon: <Sliders size={16} /> },
  { id: 'warehouses', label: 'Almacenes', icon: <Warehouse size={16} /> },
  { id: 'audit', label: 'Auditoria', icon: <Activity size={16} /> },
]

export default function AdminPage() {
  const supabase = createClient()
  const { addToast } = useToast()

  // ─── RBAC state ───
  const [rbacRoles, setRbacRoles] = useState<RbacRole[]>([])
  const [rbacPermissions, setRbacPermissions] = useState<RbacPermission[]>([])
  const [rbacTeams, setRbacTeams] = useState<RbacTeam[]>([])
  const [rolePermMap, setRolePermMap] = useState<Record<string, Set<string>>>({})
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [savingRolePerms, setSavingRolePerms] = useState(false)
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null)
  const [roleSearch, setRoleSearch] = useState('')
  const [roleCategoryFilter, setRoleCategoryFilter] = useState('')

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
  // User RBAC assignments
  const [userRbacRoles, setUserRbacRoles] = useState<Record<string, string[]>>({})
  const [userEffectivePerms, setUserEffectivePerms] = useState<string[]>([])

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

  // ─── RBAC loaders ───
  const loadRbacData = useCallback(async () => {
    setLoadingRoles(true)
    const sb = createClient()
    const [rolesRes, permsRes, teamsRes] = await Promise.all([
      sb.from('tt_roles').select('*').order('category').order('label'),
      sb.from('tt_permissions').select('*').order('module').order('label'),
      sb.from('tt_teams').select('*').order('label'),
    ])
    setRbacRoles((rolesRes.data || []) as RbacRole[])
    setRbacPermissions((permsRes.data || []) as RbacPermission[])
    setRbacTeams((teamsRes.data || []) as RbacTeam[])

    // Load role->permission map
    const { data: rp } = await sb.from('tt_role_permissions').select('role_id, permission_id')
    const map: Record<string, Set<string>> = {}
    ;(rp || []).forEach((row: Record<string, unknown>) => {
      const roleId = row.role_id as string
      const permId = row.permission_id as string
      if (!map[roleId]) map[roleId] = new Set()
      map[roleId].add(permId)
    })
    setRolePermMap(map)
    setLoadingRoles(false)
  }, [])

  // Load all user RBAC role assignments
  const loadUserRbacAssignments = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('tt_user_roles').select('user_id, role_id')
    const map: Record<string, string[]> = {}
    ;(data || []).forEach((row: Record<string, unknown>) => {
      const uid = row.user_id as string
      const rid = row.role_id as string
      if (!map[uid]) map[uid] = []
      map[uid].push(rid)
    })
    setUserRbacRoles(map)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    const sb = createClient()
    const { data } = await sb.from('tt_users').select('*').order('full_name')
    setUsersData(data || [])
    setLoadingUsers(false)
  }, [])

  // Compute effective permissions for a user based on their role IDs
  const computeEffectivePerms = useCallback((roleIds: string[]) => {
    const permIds = new Set<string>()
    roleIds.forEach(rid => {
      const rp = rolePermMap[rid]
      if (rp) rp.forEach(pid => permIds.add(pid))
    })
    const permNames = rbacPermissions
      .filter(p => permIds.has(p.id))
      .map(p => p.name)
    return permNames
  }, [rolePermMap, rbacPermissions])

  const openNewUser = () => {
    setEditingUserId(null)
    setUserForm(emptyUserForm())
    setGeneratedPassword(null)
    setShowPassword(false)
    setUserEffectivePerms([])
    setShowUserModal(true)
  }

  const openEditUser = (u: Row) => {
    const uid = u.id as string
    setEditingUserId(uid)
    const currentRbacRoleIds = userRbacRoles[uid] || []
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
      permissions: {},
      rbac_role_ids: currentRbacRoleIds,
      rbac_team_ids: [],
    })
    setUserEffectivePerms(computeEffectivePerms(currentRbacRoleIds))
    setGeneratedPassword(null)
    setShowPassword(false)
    setShowUserModal(true)
  }

  const toggleUserRbacRole = (roleId: string) => {
    setUserForm(prev => {
      const newIds = prev.rbac_role_ids.includes(roleId)
        ? prev.rbac_role_ids.filter(id => id !== roleId)
        : [...prev.rbac_role_ids, roleId]
      setUserEffectivePerms(computeEffectivePerms(newIds))
      return { ...prev, rbac_role_ids: newIds }
    })
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
          // Save RBAC role assignments
          await supabase.from('tt_user_roles').delete().eq('user_id', editingUserId)
          if (userForm.rbac_role_ids.length > 0) {
            await supabase.from('tt_user_roles').insert(
              userForm.rbac_role_ids.map(rid => ({ user_id: editingUserId, role_id: rid }))
            )
          }
          addToast({ type: 'success', title: 'Usuario actualizado' })
          setShowUserModal(false)
          loadUsers()
          loadUserRbacAssignments()
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
          // Assign RBAC roles to new user
          if (result.user_id && userForm.rbac_role_ids.length > 0) {
            await supabase.from('tt_user_roles').insert(
              userForm.rbac_role_ids.map(rid => ({ user_id: result.user_id, role_id: rid }))
            )
          }
          setGeneratedPassword(result.generated_password || null)
          addToast({ type: 'success', title: 'Usuario creado correctamente' })
          loadUsers()
          loadUserRbacAssignments()
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

  // ─── Role permission editing ───
  const toggleRolePerm = (roleId: string, permId: string) => {
    setRolePermMap(prev => {
      const newMap = { ...prev }
      const set = new Set(newMap[roleId] || [])
      if (set.has(permId)) {
        set.delete(permId)
      } else {
        set.add(permId)
      }
      newMap[roleId] = set
      return newMap
    })
  }

  const saveRolePermissions = async (roleId: string) => {
    setSavingRolePerms(true)
    try {
      // Delete existing
      await supabase.from('tt_role_permissions').delete().eq('role_id', roleId)
      // Insert new
      const permIds = Array.from(rolePermMap[roleId] || [])
      if (permIds.length > 0) {
        await supabase.from('tt_role_permissions').insert(
          permIds.map(pid => ({ role_id: roleId, permission_id: pid }))
        )
      }
      addToast({ type: 'success', title: 'Permisos del rol guardados' })
    } catch {
      addToast({ type: 'error', title: 'Error al guardar permisos' })
    } finally {
      setSavingRolePerms(false)
    }
  }

  // ─── Other loaders ───
  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true)
    const sb = createClient()
    const { data } = await sb.from('tt_companies').select('*').order('name')
    setCompanies(data || [])
    setLoadingCompanies(false)
  }, [])

  const loadParams = useCallback(async () => {
    setLoadingParams(true)
    const sb = createClient()
    const { data } = await sb.from('tt_system_params').select('*').order('key')
    setParams(data || [])
    const edits: Record<string, string> = {}
    ;(data || []).forEach((p: Row) => { edits[p.key as string] = (p.value as string) || '' })
    setParamEdits(edits)
    setLoadingParams(false)
  }, [])

  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true)
    const sb = createClient()
    const { data } = await sb.from('tt_warehouses').select('*').order('name')
    setWarehouses(data || [])
    setLoadingWarehouses(false)
  }, [])

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true)
    const sb = createClient()
    let q = sb
      .from('tt_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(auditPage * AUDIT_PAGE_SIZE, (auditPage + 1) * AUDIT_PAGE_SIZE - 1)

    if (auditEntityFilter) q = q.eq('entity_type', auditEntityFilter)

    const { data } = await q
    setAuditLogs(data || [])
    setLoadingAudit(false)
  }, [auditPage, auditEntityFilter])

  const handleTabChange = (tab: string) => {
    if (tab === 'users') { loadUsers(); loadCompanies(); loadRbacData(); loadUserRbacAssignments() }
    if (tab === 'roles') loadRbacData()
    if (tab === 'companies') loadCompanies()
    if (tab === 'params') loadParams()
    if (tab === 'warehouses') loadWarehouses()
    if (tab === 'audit') loadAudit()
  }

  useEffect(() => { loadUsers(); loadCompanies(); loadRbacData(); loadUserRbacAssignments() }, [loadUsers, loadCompanies, loadRbacData, loadUserRbacAssignments])

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
    addToast({ type: 'success', title: 'Parametros guardados' })
  }

  const addWarehouse = async () => {
    if (!newWarehouse.name.trim()) return
    await supabase.from('tt_warehouses').insert({ name: newWarehouse.name, city: newWarehouse.location || null, active: true })
    addToast({ type: 'success', title: 'Almacen creado' })
    setShowAddWarehouse(false)
    setNewWarehouse({ name: '', location: '' })
    loadWarehouses()
  }

  // Helper: get user's RBAC role labels
  const getUserRoleLabels = (userId: string): string[] => {
    const rids = userRbacRoles[userId] || []
    return rids.map(rid => {
      const role = rbacRoles.find(r => r.id === rid)
      return role?.label || ''
    }).filter(Boolean)
  }

  // Filtered roles for the Roles tab
  const filteredRoles = rbacRoles.filter(r => {
    if (roleCategoryFilter && r.category !== roleCategoryFilter) return false
    if (roleSearch) {
      const s = roleSearch.toLowerCase()
      return r.label.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)
    }
    return true
  })

  // Group permissions by module
  const permsByModule = rbacPermissions.reduce<Record<string, RbacPermission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = []
    acc[p.module].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#F0F2F5]">Administracion</h1>
        <p className="text-sm text-[#6B7280] mt-1">Configuracion del sistema, usuarios, roles y auditoria</p>
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
                  <div className="flex gap-2">
                    <ExportButton
                      data={filteredUsers as Record<string, unknown>[]}
                      filename="usuarios_torquetools"
                      columns={[
                        { key: 'username', label: 'Usuario' },
                        { key: 'full_name', label: 'Nombre' },
                        { key: 'email', label: 'Email' },
                        { key: 'role', label: 'Rol' },
                        { key: 'active', label: 'Activo' },
                        { key: 'created_at', label: 'Creado' },
                      ]}
                    />
                    <Button size="sm" onClick={openNewUser}><UserPlus size={14} /> Nuevo usuario</Button>
                  </div>
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
                            <TableHead>Roles RBAC</TableHead>
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
                                <div className="flex flex-wrap gap-1">
                                  {getUserRoleLabels(u.id as string).length > 0 ? (
                                    getUserRoleLabels(u.id as string).map(label => (
                                      <Badge key={label} variant="orange" size="sm">{label}</Badge>
                                    ))
                                  ) : (
                                    <Badge variant="default" size="sm">Sin roles</Badge>
                                  )}
                                </div>
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

            {/* ═══ ROLES ═══ */}
            {activeTab === 'roles' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Roles del sistema</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-3 flex-wrap">
                      <SearchBar placeholder="Buscar rol..." value={roleSearch} onChange={setRoleSearch} className="flex-1 min-w-[200px]" />
                      <Select
                        options={[
                          { value: '', label: 'Todas las categorias' },
                          { value: 'internal', label: 'Interno' },
                          { value: 'external_client', label: 'Cliente externo' },
                          { value: 'external_supplier', label: 'Proveedor externo' },
                        ]}
                        value={roleCategoryFilter}
                        onChange={(e) => setRoleCategoryFilter(e.target.value)}
                        className="w-52"
                      />
                    </div>

                    {loadingRoles ? (
                      <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredRoles.map(role => {
                          const permCount = rolePermMap[role.id]?.size || 0
                          return (
                            <div
                              key={role.id}
                              onClick={() => setEditingRole(role)}
                              className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/40 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck size={16} className="text-[#FF6600]" />
                                  <h3 className="text-sm font-semibold text-[#F0F2F5]">{role.label}</h3>
                                </div>
                                <Badge variant={role.category === 'internal' ? 'info' : role.category === 'external_client' ? 'warning' : 'success'} size="sm">
                                  {CATEGORY_LABELS[role.category] || role.category}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[#6B7280] mb-2 font-mono">{role.name}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-[#4B5563]">{permCount} permisos</span>
                                <Edit size={14} className="text-[#4B5563] group-hover:text-[#FF6600] transition-colors" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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
                  <CardTitle>Parametros del sistema</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingParams ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : params.length === 0 ? (
                    <p className="text-sm text-[#6B7280] text-center py-10">No hay parametros configurados</p>
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
                          <TableHead>Ubicacion</TableHead>
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

            {/* ═══ AUDIT ═══ */}
            {activeTab === 'audit' && (
              <Card>
                <CardHeader>
                  <CardTitle>Log de auditoria</CardTitle>
                  <ExportButton
                    data={auditLogs as Record<string, unknown>[]}
                    filename="auditoria_torquetools"
                    columns={[
                      { key: 'entity_type', label: 'Entidad' },
                      { key: 'action', label: 'Accion' },
                      { key: 'detail', label: 'Detalle' },
                      { key: 'created_at', label: 'Fecha' },
                    ]}
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3">
                    <Select
                      options={[
                        { value: '', label: 'Todas las entidades' },
                        { value: 'quote', label: 'Cotizacion' },
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
                          <TableHead>Accion</TableHead>
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
                    <span className="text-xs text-[#6B7280]">Pagina {auditPage + 1}</span>
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
                label="Rol legacy"
                options={LEGACY_ROLES.map(r => ({ value: r, label: LEGACY_ROLE_LABELS[r] || r }))}
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
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

            {/* RBAC Roles */}
            <div>
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">
                Roles RBAC
                <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">
                  (los permisos se derivan automaticamente de los roles asignados)
                </span>
              </p>
              {(['internal', 'external_client', 'external_supplier'] as const).map(category => {
                const categoryRoles = rbacRoles.filter(r => r.category === category)
                if (categoryRoles.length === 0) return null
                return (
                  <div key={category} className="mb-3">
                    <p className="text-[10px] font-semibold text-[#4B5563] uppercase mb-2">{CATEGORY_LABELS[category]}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {categoryRoles.map(role => {
                        const isSelected = userForm.rbac_role_ids.includes(role.id)
                        return (
                          <button
                            key={role.id}
                            onClick={() => toggleUserRbacRole(role.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                              isSelected
                                ? 'bg-[#FF6600]/10 border-[#FF6600]/30 text-[#FF6600]'
                                : 'bg-[#0F1218] border-[#1E2330] text-[#6B7280] hover:border-[#2A3040]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-[#FF6600] border-[#FF6600]'
                                : 'border-[#2A3040]'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </div>
                            <span className="truncate">{role.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Effective permissions (read-only) */}
            {userEffectivePerms.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">
                  Permisos efectivos
                  <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">(derivados de los roles seleccionados)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {userEffectivePerms.map(perm => {
                    const permObj = rbacPermissions.find(p => p.name === perm)
                    return (
                      <Badge key={perm} variant="default" size="sm">
                        {permObj?.label || perm}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}

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

      {/* ─── EDIT ROLE PERMISSIONS MODAL ─── */}
      <Modal
        isOpen={!!editingRole}
        onClose={() => setEditingRole(null)}
        title={editingRole ? `Permisos: ${editingRole.label}` : ''}
        size="xl"
      >
        {editingRole && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Badge variant={editingRole.category === 'internal' ? 'info' : editingRole.category === 'external_client' ? 'warning' : 'success'}>
                {CATEGORY_LABELS[editingRole.category] || editingRole.category}
              </Badge>
              <span className="text-xs text-[#6B7280] font-mono">{editingRole.name}</span>
            </div>

            {Object.entries(permsByModule).map(([mod, perms]) => (
              <div key={mod}>
                <p className="text-xs font-semibold text-[#FF6600] uppercase tracking-wider mb-2">
                  {MODULE_LABELS[mod] || mod}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {perms.map(perm => {
                    const isGranted = rolePermMap[editingRole.id]?.has(perm.id) || false
                    return (
                      <button
                        key={perm.id}
                        onClick={() => toggleRolePerm(editingRole.id, perm.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                          isGranted
                            ? 'bg-[#FF6600]/10 border-[#FF6600]/30 text-[#FF6600]'
                            : 'bg-[#0F1218] border-[#1E2330] text-[#6B7280] hover:border-[#2A3040]'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                          isGranted ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#2A3040]'
                        }`}>
                          {isGranted && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                        <span className="truncate">{perm.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-between pt-4 border-t border-[#1E2330]">
              <span className="text-xs text-[#4B5563]">
                {rolePermMap[editingRole.id]?.size || 0} permisos asignados
              </span>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setEditingRole(null)}>Cerrar</Button>
                <Button onClick={() => saveRolePermissions(editingRole.id)} loading={savingRolePerms}>
                  <Save size={14} /> Guardar permisos
                </Button>
              </div>
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
            <Input label="Direccion" value={companyForm.address || ''} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} />
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
      <Modal isOpen={showAddWarehouse} onClose={() => setShowAddWarehouse(false)} title="Nuevo almacen" size="sm">
        <div className="space-y-4">
          <Input label="Nombre" value={newWarehouse.name} onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })} placeholder="Almacen principal" />
          <Input label="Ubicacion" value={newWarehouse.location} onChange={(e) => setNewWarehouse({ ...newWarehouse, location: e.target.value })} placeholder="Madrid, Espana" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddWarehouse(false)}>Cancelar</Button>
            <Button onClick={addWarehouse}><Plus size={14} /> Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
