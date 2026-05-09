'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
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
import { CompanyLogosPanel } from '@/components/admin/companies/company-logos-panel'
import { CompanyConfigModal } from '@/components/admin/companies/company-config-modal'
import {
  Settings, Users, Building2, Sliders, Warehouse, Activity,
  Save, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Shield,
  UserPlus, Power, Copy, Eye, EyeOff, Check, ShieldCheck, X,
  FileText, Trash2, Palette
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
  email_personal: string
  whatsapp: string
  whatsapp_empresa: string
  phone: string
  company_ids: string[]
  active: boolean
  permissions: Record<string, boolean>
  specialties: string[]
  // RBAC
  rbac_role_ids: string[]
  rbac_team_ids: string[]
}

const STAFF_SPECIALTIES = [
  { value: 'torque', label: 'Torque (atornilladores, torquimetros)' },
  { value: 'ingenieria', label: 'Ingenieria / Produccion' },
  { value: 'produccion', label: 'Produccion' },
  { value: 'epp_seguridad', label: 'EPP / Seguridad Industrial' },
  { value: 'ecommerce', label: 'Comercio Electronico' },
  { value: 'logistica', label: 'Logistica / Envios' },
  { value: 'administracion', label: 'Administracion' },
  { value: 'sat', label: 'Servicio Tecnico (SAT)' },
  { value: 'calibracion', label: 'Calibracion' },
  { value: 'all', label: 'Ve todo (Admin)' },
]

// ─── Document Templates ───
interface TemplateRow {
  id: string
  name: string
  doc_type: string
  company_id: string | null
  is_default: boolean
  language: string
  header_html: string | null
  footer_html: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  font_family: string
  show_logo: boolean
  show_company_address: boolean
  show_client_tax_id: boolean
  show_sku: boolean
  show_discount: boolean
  show_unit_price: boolean
  show_photos: boolean
  show_notes: boolean
  show_bank_details: boolean
  show_terms: boolean
  show_incoterm: boolean
  show_payment_terms: boolean
  show_valid_until: boolean
  show_delivery_date: boolean
  show_page_numbers: boolean
  terms_text: string | null
  footer_text: string | null
  custom_css: string | null
  active: boolean
  created_at: string
  updated_at: string
}

const DOC_TYPES = [
  { value: 'cotizacion', label: 'Cotizacion' },
  { value: 'presupuesto', label: 'Presupuesto' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'oferta', label: 'Oferta' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'factura', label: 'Factura' },
  { value: 'albaran', label: 'Albaran' },
  { value: 'pap', label: 'PAP' },
]

const DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]))

const TEMPLATE_FONTS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
]

const TEMPLATE_LANGUAGES = [
  { value: 'es', label: 'Espanol' },
  { value: 'en', label: 'Ingles' },
  { value: 'pt', label: 'Portugues' },
]

const SHOW_FIELD_LABELS: Record<string, string> = {
  show_logo: 'Logo',
  show_company_address: 'Direccion empresa',
  show_client_tax_id: 'CIF/CUIT cliente',
  show_sku: 'SKU / Ref.',
  show_discount: 'Descuento',
  show_unit_price: 'Precio unitario',
  show_photos: 'Fotos producto',
  show_notes: 'Notas',
  show_bank_details: 'Datos bancarios',
  show_terms: 'Terminos',
  show_incoterm: 'Incoterm',
  show_payment_terms: 'Condiciones de pago',
  show_valid_until: 'Validez',
  show_delivery_date: 'Fecha entrega',
  show_page_numbers: 'Numeros de pagina',
}

const SHOW_FIELDS = Object.keys(SHOW_FIELD_LABELS) as (keyof typeof SHOW_FIELD_LABELS)[]

// ─── Custom Statuses ───
interface CustomStatus {
  id: string
  doc_type: string
  status_key: string
  label: string
  color: string
  icon: string | null
  sort_order: number
  is_system: boolean
  active: boolean
  company_id: string | null
}

const STATUS_DOC_TYPES = [
  { value: 'cotizacion', label: 'Cotizacion' },
  { value: 'pedido', label: 'Pedido' },
  { value: 'factura', label: 'Factura' },
  { value: 'albaran', label: 'Albaran' },
  { value: 'compra', label: 'Compra' },
  { value: 'sat', label: 'SAT' },
  { value: 'lead', label: 'Lead' },
]

const STATUS_DOC_TYPE_LABELS: Record<string, string> = Object.fromEntries(STATUS_DOC_TYPES.map(d => [d.value, d.label]))

const STATUS_PRESET_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#FF6600', '#F97316',
]

function emptyTemplate(): Omit<TemplateRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: '', doc_type: 'cotizacion', company_id: null, is_default: false,
    language: 'es', header_html: '', footer_html: '', logo_url: '',
    primary_color: '#FF6600', secondary_color: '#1E2330', font_family: 'Arial',
    show_logo: true, show_company_address: true, show_client_tax_id: true,
    show_sku: true, show_discount: true, show_unit_price: true, show_photos: false,
    show_notes: true, show_bank_details: true, show_terms: true, show_incoterm: false,
    show_payment_terms: true, show_valid_until: true, show_delivery_date: false,
    show_page_numbers: true, terms_text: '', footer_text: '', custom_css: '', active: true,
  }
}

function emptyUserForm(): UserForm {
  return {
    username: '', full_name: '', email: '', role: 'vendedor',
    gmail: '', email_personal: '', whatsapp: '', whatsapp_empresa: '', phone: '',
    company_ids: [], active: true,
    permissions: {},
    specialties: [],
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
  { id: 'plantillas', label: 'Plantillas', icon: <FileText size={16} /> },
  { id: 'estados', label: 'Estados', icon: <Palette size={16} /> },
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

  // Plantillas (Document Templates)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState(emptyTemplate())
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSection, setTemplateSection] = useState<'general' | 'apariencia' | 'visibilidad' | 'contenido' | 'css'>('general')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Custom Statuses
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([])
  const [loadingStatuses, setLoadingStatuses] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [statusForm, setStatusForm] = useState({ doc_type: 'cotizacion', status_key: '', label: '', color: '#6B7280' })
  const [savingStatus, setSavingStatus] = useState(false)
  const [showDeleteStatusConfirm, setShowDeleteStatusConfirm] = useState(false)

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
      email_personal: ((u.permissions as Record<string, unknown>)?.email_personal as string) || '',
      whatsapp: (u.whatsapp as string) || '',
      whatsapp_empresa: ((u.permissions as Record<string, unknown>)?.whatsapp_empresa as string) || '',
      phone: (u.phone as string) || '',
      company_ids: ((u.permissions as Record<string, unknown>)?.company_ids as string[]) || (u.company_id ? [u.company_id as string] : []),
      active: u.active !== false,
      permissions: {},
      specialties: ((u.permissions as Record<string, unknown>)?.specialties as string[]) || [],
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
        // Update existing user — server merges permissions JSONB and mirrors company_id
        const { permissions: _ignored, rbac_role_ids: _ignored2, rbac_team_ids: _ignored3, ...formFields } = userForm
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingUserId,
            ...formFields,
            email_personal: userForm.email_personal || null,
            whatsapp_empresa: userForm.whatsapp_empresa || null,
          }),
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

  // ─── Template loaders & actions ───
  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    const sb = createClient()
    const { data } = await sb.from('tt_document_templates').select('*').order('doc_type').order('name')
    setTemplates((data || []) as TemplateRow[])
    setLoadingTemplates(false)
  }, [])

  const openNewTemplate = () => {
    setEditingTemplateId(null)
    setTemplateForm(emptyTemplate())
    setTemplateSection('general')
    setShowDeleteConfirm(false)
    setShowTemplateModal(true)
  }

  const openEditTemplate = (t: TemplateRow) => {
    setEditingTemplateId(t.id)
    setTemplateForm({
      name: t.name || '',
      doc_type: t.doc_type || 'cotizacion',
      company_id: t.company_id || null,
      is_default: t.is_default || false,
      language: t.language || 'es',
      header_html: t.header_html || '',
      footer_html: t.footer_html || '',
      logo_url: t.logo_url || '',
      primary_color: t.primary_color || '#FF6600',
      secondary_color: t.secondary_color || '#1E2330',
      font_family: t.font_family || 'Arial',
      show_logo: t.show_logo !== false,
      show_company_address: t.show_company_address !== false,
      show_client_tax_id: t.show_client_tax_id !== false,
      show_sku: t.show_sku !== false,
      show_discount: t.show_discount !== false,
      show_unit_price: t.show_unit_price !== false,
      show_photos: t.show_photos || false,
      show_notes: t.show_notes !== false,
      show_bank_details: t.show_bank_details !== false,
      show_terms: t.show_terms !== false,
      show_incoterm: t.show_incoterm || false,
      show_payment_terms: t.show_payment_terms !== false,
      show_valid_until: t.show_valid_until !== false,
      show_delivery_date: t.show_delivery_date || false,
      show_page_numbers: t.show_page_numbers !== false,
      terms_text: t.terms_text || '',
      footer_text: t.footer_text || '',
      custom_css: t.custom_css || '',
      active: t.active !== false,
    })
    setTemplateSection('general')
    setShowDeleteConfirm(false)
    setShowTemplateModal(true)
  }

  const saveTemplate = async () => {
    if (!templateForm.name.trim()) {
      addToast({ type: 'warning', title: 'El nombre es obligatorio' })
      return
    }
    setSavingTemplate(true)
    try {
      const sb = createClient()
      const payload = {
        name: templateForm.name,
        doc_type: templateForm.doc_type,
        company_id: templateForm.company_id || null,
        is_default: templateForm.is_default,
        language: templateForm.language,
        header_html: templateForm.header_html || null,
        footer_html: templateForm.footer_html || null,
        logo_url: templateForm.logo_url || null,
        primary_color: templateForm.primary_color,
        secondary_color: templateForm.secondary_color,
        font_family: templateForm.font_family,
        show_logo: templateForm.show_logo,
        show_company_address: templateForm.show_company_address,
        show_client_tax_id: templateForm.show_client_tax_id,
        show_sku: templateForm.show_sku,
        show_discount: templateForm.show_discount,
        show_unit_price: templateForm.show_unit_price,
        show_photos: templateForm.show_photos,
        show_notes: templateForm.show_notes,
        show_bank_details: templateForm.show_bank_details,
        show_terms: templateForm.show_terms,
        show_incoterm: templateForm.show_incoterm,
        show_payment_terms: templateForm.show_payment_terms,
        show_valid_until: templateForm.show_valid_until,
        show_delivery_date: templateForm.show_delivery_date,
        show_page_numbers: templateForm.show_page_numbers,
        terms_text: templateForm.terms_text || null,
        footer_text: templateForm.footer_text || null,
        custom_css: templateForm.custom_css || null,
        active: templateForm.active,
      }

      if (editingTemplateId) {
        const { error } = await sb.from('tt_document_templates').update(payload).eq('id', editingTemplateId)
        if (error) {
          addToast({ type: 'error', title: 'Error al actualizar', message: error.message })
        } else {
          addToast({ type: 'success', title: 'Plantilla actualizada' })
          setShowTemplateModal(false)
          loadTemplates()
        }
      } else {
        const { error } = await sb.from('tt_document_templates').insert(payload)
        if (error) {
          addToast({ type: 'error', title: 'Error al crear', message: error.message })
        } else {
          addToast({ type: 'success', title: 'Plantilla creada' })
          setShowTemplateModal(false)
          loadTemplates()
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error de red', message: (err as Error).message })
    } finally {
      setSavingTemplate(false)
    }
  }

  const deleteTemplate = async () => {
    if (!editingTemplateId) return
    setSavingTemplate(true)
    try {
      const sb = createClient()
      const { error } = await sb.from('tt_document_templates').delete().eq('id', editingTemplateId)
      if (error) {
        addToast({ type: 'error', title: 'Error al eliminar', message: error.message })
      } else {
        addToast({ type: 'success', title: 'Plantilla eliminada' })
        setShowTemplateModal(false)
        setShowDeleteConfirm(false)
        loadTemplates()
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error de red', message: (err as Error).message })
    } finally {
      setSavingTemplate(false)
    }
  }

  const toggleTemplateActive = async (t: TemplateRow) => {
    const sb = createClient()
    const { error } = await sb.from('tt_document_templates').update({ active: !t.active }).eq('id', t.id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
    } else {
      addToast({ type: 'success', title: t.active ? 'Plantilla desactivada' : 'Plantilla activada' })
      loadTemplates()
    }
  }

  // Group templates by doc_type
  const templatesByDocType = templates.reduce<Record<string, TemplateRow[]>>((acc, t) => {
    if (!acc[t.doc_type]) acc[t.doc_type] = []
    acc[t.doc_type].push(t)
    return acc
  }, {})

  // ─── Custom Statuses loaders & actions ───
  const loadStatuses = useCallback(async () => {
    setLoadingStatuses(true)
    const sb = createClient()
    const { data } = await sb.from('tt_custom_statuses').select('*').order('doc_type').order('sort_order')
    setCustomStatuses((data || []) as CustomStatus[])
    setLoadingStatuses(false)
  }, [])

  const openNewStatus = () => {
    setEditingStatusId(null)
    setStatusForm({ doc_type: 'cotizacion', status_key: '', label: '', color: '#6B7280' })
    setShowDeleteStatusConfirm(false)
    setShowStatusModal(true)
  }

  const openEditStatus = (s: CustomStatus) => {
    setEditingStatusId(s.id)
    setStatusForm({
      doc_type: s.doc_type,
      status_key: s.status_key,
      label: s.label,
      color: s.color || '#6B7280',
    })
    setShowDeleteStatusConfirm(false)
    setShowStatusModal(true)
  }

  const saveStatus = async () => {
    if (!statusForm.label.trim()) {
      addToast({ type: 'warning', title: 'El label es obligatorio' })
      return
    }
    if (!editingStatusId && !statusForm.status_key.trim()) {
      addToast({ type: 'warning', title: 'El status_key es obligatorio' })
      return
    }
    setSavingStatus(true)
    try {
      const sb = createClient()
      if (editingStatusId) {
        // Only update label and color (status_key is immutable for system)
        const { error } = await sb.from('tt_custom_statuses').update({
          label: statusForm.label,
          color: statusForm.color,
        }).eq('id', editingStatusId)
        if (error) {
          addToast({ type: 'error', title: 'Error al actualizar', message: error.message })
        } else {
          addToast({ type: 'success', title: 'Estado actualizado' })
          setShowStatusModal(false)
          loadStatuses()
        }
      } else {
        // Get max sort_order for this doc_type
        const { data: existing } = await sb.from('tt_custom_statuses')
          .select('sort_order')
          .eq('doc_type', statusForm.doc_type)
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextOrder = ((existing?.[0]?.sort_order as number) || 0) + 1

        const { error } = await sb.from('tt_custom_statuses').insert({
          doc_type: statusForm.doc_type,
          status_key: statusForm.status_key.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          label: statusForm.label,
          color: statusForm.color,
          icon: null,
          sort_order: nextOrder,
          is_system: false,
          active: true,
          company_id: null,
        })
        if (error) {
          addToast({ type: 'error', title: 'Error al crear', message: error.message })
        } else {
          addToast({ type: 'success', title: 'Estado creado' })
          setShowStatusModal(false)
          loadStatuses()
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error de red', message: (err as Error).message })
    } finally {
      setSavingStatus(false)
    }
  }

  const deleteStatus = async () => {
    if (!editingStatusId) return
    setSavingStatus(true)
    try {
      const sb = createClient()
      const { error } = await sb.from('tt_custom_statuses').delete().eq('id', editingStatusId)
      if (error) {
        addToast({ type: 'error', title: 'Error al eliminar', message: error.message })
      } else {
        addToast({ type: 'success', title: 'Estado eliminado' })
        setShowStatusModal(false)
        setShowDeleteStatusConfirm(false)
        loadStatuses()
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Error de red', message: (err as Error).message })
    } finally {
      setSavingStatus(false)
    }
  }

  const toggleStatusActive = async (s: CustomStatus) => {
    const sb = createClient()
    const { error } = await sb.from('tt_custom_statuses').update({ active: !s.active }).eq('id', s.id)
    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
    } else {
      addToast({ type: 'success', title: s.active ? 'Estado desactivado' : 'Estado activado' })
      loadStatuses()
    }
  }

  const moveStatus = async (statusId: string, direction: 'up' | 'down') => {
    const status = customStatuses.find(s => s.id === statusId)
    if (!status) return
    const sameType = customStatuses.filter(s => s.doc_type === status.doc_type).sort((a, b) => a.sort_order - b.sort_order)
    const idx = sameType.findIndex(s => s.id === statusId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sameType.length) return
    const sb = createClient()
    const orderA = sameType[idx].sort_order
    const orderB = sameType[swapIdx].sort_order
    await Promise.all([
      sb.from('tt_custom_statuses').update({ sort_order: orderB }).eq('id', sameType[idx].id),
      sb.from('tt_custom_statuses').update({ sort_order: orderA }).eq('id', sameType[swapIdx].id),
    ])
    loadStatuses()
  }

  // Group statuses by doc_type
  const statusesByDocType = customStatuses.reduce<Record<string, CustomStatus[]>>((acc, s) => {
    if (!acc[s.doc_type]) acc[s.doc_type] = []
    acc[s.doc_type].push(s)
    return acc
  }, {})

  const handleTabChange = (tab: string) => {
    if (tab === 'users') { loadUsers(); loadCompanies(); loadRbacData(); loadUserRbacAssignments() }
    if (tab === 'roles') loadRbacData()
    if (tab === 'companies') loadCompanies()
    if (tab === 'params') loadParams()
    if (tab === 'warehouses') loadWarehouses()
    if (tab === 'audit') loadAudit()
    if (tab === 'plantillas') loadTemplates()
    if (tab === 'estados') loadStatuses()
  }

  useEffect(() => { loadUsers(); loadCompanies(); loadRbacData(); loadUserRbacAssignments() }, [loadUsers, loadCompanies, loadRbacData, loadUserRbacAssignments])

  const openEditCompany = (c: Row) => {
    setEditCompany(c)
    // Cargar TODOS los campos de la empresa (estructurados + legacy)
    // para que el modal pueda detectar legacy y editar campos estructurados
    const all: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) {
      if (v == null) continue
      all[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
    }
    setCompanyForm(all)
  }

  const saveCompany = async () => {
    if (!editCompany) return
    await supabase.from('tt_companies').update({
      name: companyForm.name,
      trade_name: companyForm.trade_name || null,
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
              <div className="space-y-4">
                {/* ── Logos ── */}
                <Card>
                  <CardContent className="pt-5">
                    {loadingCompanies ? (
                      <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                    ) : (
                      <CompanyLogosPanel
                        companies={companies.map((c) => ({
                          id: c.id as string,
                          name: (c.name as string) || '',
                          logo_url: (c.logo_url as string) ?? null,
                          country: (c.country as string) ?? null,
                          code_prefix: (c.code_prefix as string) ?? null,
                        }))}
                        onUpdated={loadCompanies}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* ── Datos / Config ── */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Datos y configuración</CardTitle>
                    <Link href="/admin/companies/new">
                      <Button size="sm">
                        <Plus size={14} /> Nueva empresa
                      </Button>
                    </Link>
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
                            <div className="flex items-center gap-3 mb-3">
                              {/* Logo miniatura */}
                              {!!c.logo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={c.logo_url as string}
                                  alt={(c.name as string) || ''}
                                  className="h-8 w-16 object-contain rounded bg-white/5 p-0.5"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-[#F0F2F5] truncate">{(c.name as string) || '-'}</h3>
                              </div>
                              <Badge variant="success">Activa</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div><p className="text-[10px] text-[#6B7280]">CIF/CUIT</p><p className="text-[#D1D5DB] text-xs">{(c.tax_id as string) || '-'}</p></div>
                              <div><p className="text-[10px] text-[#6B7280]">Pais</p><p className="text-[#D1D5DB] text-xs">{(c.country as string) || '-'}</p></div>
                              <div><p className="text-[10px] text-[#6B7280]">IVA</p><p className="text-[#D1D5DB] text-xs">{c.default_tax_rate ? `${c.default_tax_rate}%` : '-'}</p></div>
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
              </div>
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

            {/* ═══ PLANTILLAS ═══ */}
            {activeTab === 'plantillas' && (
              <Card>
                <CardHeader>
                  <CardTitle>Plantillas de documentos</CardTitle>
                  <Button size="sm" onClick={openNewTemplate}><Plus size={14} /> Nueva plantilla</Button>
                </CardHeader>
                <CardContent>
                  {loadingTemplates ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-10 text-[#6B7280]">
                      <FileText size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No hay plantillas configuradas</p>
                      <p className="text-xs text-[#4B5563] mt-1">Crea una plantilla para personalizar tus documentos</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(templatesByDocType).map(([docType, docTemplates]) => (
                        <div key={docType}>
                          <p className="text-xs font-semibold text-[#FF6600] uppercase tracking-wider mb-3">
                            {DOC_TYPE_LABELS[docType] || docType}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {docTemplates.map(t => (
                              <div
                                key={t.id}
                                onClick={() => openEditTemplate(t)}
                                className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330] hover:border-[#FF6600]/40 cursor-pointer transition-all group"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                                      style={{ backgroundColor: t.primary_color || '#FF6600' }}
                                    />
                                    <h3 className="text-sm font-semibold text-[#F0F2F5] truncate">{t.name}</h3>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {t.is_default && <Badge variant="orange" size="sm">Default</Badge>}
                                    <Badge variant={t.active ? 'success' : 'default'} size="sm">
                                      {t.active ? 'Activa' : 'Inactiva'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-[#6B7280]">{t.language?.toUpperCase()}</span>
                                    <span className="text-[11px] text-[#4B5563]">{t.font_family}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleTemplateActive(t) }}
                                      className={`w-8 h-4 rounded-full transition-all relative ${t.active ? 'bg-emerald-500/30' : 'bg-[#2A3040]'}`}
                                      title={t.active ? 'Desactivar' : 'Activar'}
                                    >
                                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${t.active ? 'right-0.5' : 'left-0.5'}`} />
                                    </button>
                                    <Edit size={14} className="text-[#4B5563] group-hover:text-[#FF6600] transition-colors" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ═══ ESTADOS ═══ */}
            {activeTab === 'estados' && (
              <Card>
                <CardHeader>
                  <CardTitle>Estados personalizados</CardTitle>
                  <Button size="sm" onClick={openNewStatus}><Plus size={14} /> Nuevo estado</Button>
                </CardHeader>
                <CardContent>
                  {loadingStatuses ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#FF6600]" size={28} /></div>
                  ) : customStatuses.length === 0 ? (
                    <div className="text-center py-10 text-[#6B7280]">
                      <Palette size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No hay estados configurados</p>
                      <p className="text-xs text-[#4B5563] mt-1">Los estados definen el flujo de cada tipo de documento</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(statusesByDocType).map(([docType, docStatuses]) => {
                        const sorted = [...docStatuses].sort((a, b) => a.sort_order - b.sort_order)
                        return (
                          <div key={docType}>
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-semibold text-[#FF6600] uppercase tracking-wider">
                                {STATUS_DOC_TYPE_LABELS[docType] || docType}
                              </p>
                              <Badge variant="default" size="sm">{sorted.length} estados</Badge>
                            </div>
                            <div className="space-y-1.5">
                              {sorted.map((s, idx) => (
                                <div
                                  key={s.id}
                                  className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0F1218] border transition-all group ${
                                    s.active ? 'border-[#1E2330] hover:border-[#2A3040]' : 'border-[#1E2330]/50 opacity-50'
                                  }`}
                                >
                                  {/* Reorder buttons */}
                                  <div className="flex flex-col gap-0.5 shrink-0">
                                    <button
                                      onClick={() => moveStatus(s.id, 'up')}
                                      disabled={idx === 0}
                                      className="text-[#4B5563] hover:text-[#FF6600] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                      title="Subir"
                                    >
                                      <ChevronLeft size={12} className="rotate-90" />
                                    </button>
                                    <button
                                      onClick={() => moveStatus(s.id, 'down')}
                                      disabled={idx === sorted.length - 1}
                                      className="text-[#4B5563] hover:text-[#FF6600] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                      title="Bajar"
                                    >
                                      <ChevronRight size={12} className="rotate-90" />
                                    </button>
                                  </div>

                                  {/* Color dot */}
                                  <div
                                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/10"
                                    style={{ backgroundColor: s.color || '#6B7280' }}
                                  />

                                  {/* Label */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-[#F0F2F5] truncate">{s.label}</span>
                                      <span className="text-[10px] text-[#4B5563] font-mono">{s.status_key}</span>
                                    </div>
                                  </div>

                                  {/* Badges */}
                                  <div className="flex items-center gap-2 shrink-0">
                                    {s.is_system && (
                                      <Badge variant="info" size="sm">Sistema</Badge>
                                    )}

                                    {/* Active toggle */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleStatusActive(s) }}
                                      className={`w-8 h-4 rounded-full transition-all relative ${s.active ? 'bg-emerald-500/30' : 'bg-[#2A3040]'}`}
                                      title={s.active ? 'Desactivar' : 'Activar'}
                                    >
                                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${s.active ? 'right-0.5' : 'left-0.5'}`} />
                                    </button>

                                    {/* Edit */}
                                    <button
                                      onClick={() => openEditStatus(s)}
                                      className="text-[#4B5563] hover:text-[#FF6600] transition-colors"
                                      title="Editar"
                                    >
                                      <Edit size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
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

            {/* Contact info - expanded */}
            <div>
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">Emails</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Gmail (Google Chat)" value={userForm.gmail} onChange={(e) => setUserForm({ ...userForm, gmail: e.target.value })} placeholder="juan@gmail.com" />
                <Input label="Email personal" value={userForm.email_personal} onChange={(e) => setUserForm({ ...userForm, email_personal: e.target.value })} placeholder="juanm@hotmail.com" />
                <Input label="Telefono" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="+34 900 000 000" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider mb-3">WhatsApp</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="WhatsApp personal" value={userForm.whatsapp} onChange={(e) => setUserForm({ ...userForm, whatsapp: e.target.value })} placeholder="+34 600 000 000" />
                <Input label="WhatsApp empresa" value={userForm.whatsapp_empresa} onChange={(e) => setUserForm({ ...userForm, whatsapp_empresa: e.target.value })} placeholder="+34 900 000 000 (linea empresa)" />
              </div>
            </div>

            {/* Multi-company & status */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                  Empresas asignadas
                  <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">(puede pertenecer a varias)</span>
                </p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setUserForm(prev => ({ ...prev, company_ids: companies.map(c => c.id as string) }))}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-[#FF6600]/40 hover:text-[#FF6600] transition-all">
                    Todos
                  </button>
                  <button type="button"
                    onClick={() => setUserForm(prev => ({ ...prev, company_ids: [] }))}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-red-500/40 hover:text-red-400 transition-all">
                    Ninguno
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {companies.map(c => {
                  const cid = c.id as string
                  const isSelected = userForm.company_ids.includes(cid)
                  return (
                    <button key={cid} type="button"
                      onClick={() => setUserForm(prev => ({
                        ...prev,
                        company_ids: isSelected ? prev.company_ids.filter(id => id !== cid) : [...prev.company_ids, cid]
                      }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                        isSelected ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'bg-[#0F1218] text-[#6B7280] border border-[#1E2330] hover:border-[#2A3040]'
                      }`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-[#2A3040]'}`}>
                        {isSelected && <span className="text-white text-[10px]">&#10003;</span>}
                      </div>
                      {(c.name as string) || '-'}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Estado</p>
              <button
                onClick={() => setUserForm({ ...userForm, active: !userForm.active })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  userForm.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                <Power size={14} />
                <span className="text-sm font-medium">{userForm.active ? 'Activo' : 'Inactivo'}</span>
              </button>
            </div>

            {/* RBAC Roles */}
            {/* Specialties */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                  Especialidades
                  <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">
                    (determina que leads/avisos recibe este usuario)
                  </span>
                </p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setUserForm(prev => ({ ...prev, specialties: STAFF_SPECIALTIES.map(s => s.value) }))}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-[#FF6600]/40 hover:text-[#FF6600] transition-all">
                    Todas
                  </button>
                  <button type="button"
                    onClick={() => setUserForm(prev => ({ ...prev, specialties: [] }))}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-red-500/40 hover:text-red-400 transition-all">
                    Ninguna
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STAFF_SPECIALTIES.map(spec => {
                  const isSelected = userForm.specialties.includes(spec.value)
                  return (
                    <button key={spec.value} type="button"
                      onClick={() => setUserForm(prev => ({
                        ...prev,
                        specialties: isSelected
                          ? prev.specialties.filter(s => s !== spec.value)
                          : [...prev.specialties, spec.value]
                      }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                        isSelected
                          ? 'bg-[#FF6600]/15 text-[#FF6600] border border-[#FF6600]/30'
                          : 'bg-[#0F1218] text-[#6B7280] border border-[#1E2330] hover:border-[#2A3040]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#2A3040]'}`}>
                        {isSelected && <span className="text-white text-[10px]">&#10003;</span>}
                      </div>
                      {spec.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">
                  Roles RBAC
                  <span className="text-[10px] font-normal normal-case ml-2 text-[#4B5563]">
                    (los permisos se derivan automaticamente de los roles asignados)
                  </span>
                </p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => {
                      const allIds = rbacRoles.map(r => r.id)
                      setUserForm(prev => ({ ...prev, rbac_role_ids: allIds }))
                      setUserEffectivePerms(computeEffectivePerms(allIds))
                    }}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-[#FF6600]/40 hover:text-[#FF6600] transition-all">
                    Todos
                  </button>
                  <button type="button"
                    onClick={() => {
                      setUserForm(prev => ({ ...prev, rbac_role_ids: [] }))
                      setUserEffectivePerms([])
                    }}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-[#1E2330] text-[#9CA3AF] hover:border-red-500/40 hover:text-red-400 transition-all">
                    Ninguno
                  </button>
                </div>
              </div>
              {(['internal', 'external_client', 'external_supplier'] as const).map(category => {
                const categoryRoles = rbacRoles.filter(r => r.category === category)
                if (categoryRoles.length === 0) return null
                const categoryRoleIds = categoryRoles.map(r => r.id)
                const allCategorySelected = categoryRoleIds.every(id => userForm.rbac_role_ids.includes(id))
                return (
                  <div key={category} className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-[#4B5563] uppercase">{CATEGORY_LABELS[category]}</p>
                      <button type="button"
                        onClick={() => {
                          const newIds = allCategorySelected
                            ? userForm.rbac_role_ids.filter(id => !categoryRoleIds.includes(id))
                            : Array.from(new Set([...userForm.rbac_role_ids, ...categoryRoleIds]))
                          setUserForm(prev => ({ ...prev, rbac_role_ids: newIds }))
                          setUserEffectivePerms(computeEffectivePerms(newIds))
                        }}
                        className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[#1E2330] text-[#6B7280] hover:border-[#FF6600]/40 hover:text-[#FF6600] transition-all">
                        {allCategorySelected ? 'Quitar todos' : 'Marcar todos'}
                      </button>
                    </div>
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

      {/* ─── EDIT COMPANY (modal nuevo profesional) ─── */}
      <CompanyConfigModal
        open={!!editCompany}
        onClose={() => setEditCompany(null)}
        company={editCompany ? { id: editCompany.id, ...companyForm } as Parameters<typeof CompanyConfigModal>[0]['company'] : null}
        onSaved={() => { void loadCompanies?.(); }}
      />

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

      {/* ─── CREATE / EDIT TEMPLATE MODAL ─── */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title={editingTemplateId ? 'Editar plantilla' : 'Nueva plantilla'}
        size="xl"
      >
        <div className="space-y-5">
          {/* Section nav */}
          <div className="flex gap-1 p-1 bg-[#0A0D12] rounded-lg border border-[#1E2330] overflow-x-auto scrollbar-hide">
            {([
              { id: 'general' as const, label: 'General' },
              { id: 'apariencia' as const, label: 'Apariencia' },
              { id: 'visibilidad' as const, label: 'Visibilidad' },
              { id: 'contenido' as const, label: 'Contenido' },
              { id: 'css' as const, label: 'CSS' },
            ]).map(sec => (
              <button
                key={sec.id}
                onClick={() => setTemplateSection(sec.id)}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  templateSection === sec.id
                    ? 'bg-[#1E2330] text-[#FF6600] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>

          {/* ── General ── */}
          {templateSection === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nombre *"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="Plantilla estandar ES"
                />
                <Select
                  label="Tipo de documento"
                  options={DOC_TYPES}
                  value={templateForm.doc_type}
                  onChange={(e) => setTemplateForm({ ...templateForm, doc_type: e.target.value })}
                />
                <Select
                  label="Idioma"
                  options={TEMPLATE_LANGUAGES}
                  value={templateForm.language}
                  onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
                />
                <Select
                  label="Empresa (opcional)"
                  options={[
                    { value: '', label: 'Todas las empresas' },
                    ...companies.map(c => ({ value: c.id as string, label: (c.name as string) || '-' })),
                  ]}
                  value={templateForm.company_id || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, company_id: e.target.value || null })}
                />
              </div>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setTemplateForm({ ...templateForm, is_default: !templateForm.is_default })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    templateForm.is_default
                      ? 'bg-[#FF6600]/10 border-[#FF6600]/30 text-[#FF6600]'
                      : 'bg-[#0F1218] border-[#1E2330] text-[#6B7280] hover:border-[#2A3040]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                    templateForm.is_default ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#2A3040]'
                  }`}>
                    {templateForm.is_default && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-sm font-medium">Plantilla por defecto</span>
                </button>
                <button
                  onClick={() => setTemplateForm({ ...templateForm, active: !templateForm.active })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                    templateForm.active
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  <Power size={14} />
                  <span className="text-sm font-medium">{templateForm.active ? 'Activa' : 'Inactiva'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Apariencia ── */}
          {templateSection === 'apariencia' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Color primario</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={templateForm.primary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-[#2A3040] bg-transparent cursor-pointer"
                    />
                    <Input
                      value={templateForm.primary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, primary_color: e.target.value })}
                      placeholder="#FF6600"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Color secundario</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={templateForm.secondary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, secondary_color: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-[#2A3040] bg-transparent cursor-pointer"
                    />
                    <Input
                      value={templateForm.secondary_color}
                      onChange={(e) => setTemplateForm({ ...templateForm, secondary_color: e.target.value })}
                      placeholder="#1E2330"
                      className="flex-1"
                    />
                  </div>
                </div>
                <Select
                  label="Tipografia"
                  options={TEMPLATE_FONTS}
                  value={templateForm.font_family}
                  onChange={(e) => setTemplateForm({ ...templateForm, font_family: e.target.value })}
                />
                <Input
                  label="URL del logo"
                  value={templateForm.logo_url || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              {/* Preview swatch */}
              <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
                <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-3">Vista previa</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg border border-white/10" style={{ backgroundColor: templateForm.primary_color }} />
                    <span className="text-xs text-[#9CA3AF]">Primario</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg border border-white/10" style={{ backgroundColor: templateForm.secondary_color }} />
                    <span className="text-xs text-[#9CA3AF]">Secundario</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#F0F2F5]" style={{ fontFamily: templateForm.font_family }}>
                      Aa Bb Cc 123
                    </span>
                    <span className="text-xs text-[#4B5563]">({templateForm.font_family})</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Visibilidad ── */}
          {templateSection === 'visibilidad' && (
            <div className="space-y-4">
              <p className="text-xs text-[#6B7280]">Selecciona que campos se muestran en el documento generado</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SHOW_FIELDS.map(field => {
                  const isOn = templateForm[field as keyof typeof templateForm] as boolean
                  return (
                    <button
                      key={field}
                      onClick={() => setTemplateForm({ ...templateForm, [field]: !isOn })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-left ${
                        isOn
                          ? 'bg-[#FF6600]/10 border-[#FF6600]/30 text-[#FF6600]'
                          : 'bg-[#0F1218] border-[#1E2330] text-[#6B7280] hover:border-[#2A3040]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                        isOn ? 'bg-[#FF6600] border-[#FF6600]' : 'border-[#2A3040]'
                      }`}>
                        {isOn && <Check size={10} className="text-white" />}
                      </div>
                      {SHOW_FIELD_LABELS[field]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Contenido ── */}
          {templateSection === 'contenido' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Terminos y condiciones</label>
                <textarea
                  value={templateForm.terms_text || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, terms_text: e.target.value })}
                  className="w-full h-28 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                  placeholder="Los precios no incluyen IVA..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Texto del pie de pagina</label>
                <textarea
                  value={templateForm.footer_text || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, footer_text: e.target.value })}
                  className="w-full h-20 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                  placeholder="TORQUETOOLS SL - CIF B12345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">HTML cabecera <span className="text-[10px] text-[#4B5563]">(avanzado)</span></label>
                <textarea
                  value={templateForm.header_html || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, header_html: e.target.value })}
                  className="w-full h-24 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-xs text-[#F0F2F5] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                  placeholder="<div>...</div>"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">HTML pie <span className="text-[10px] text-[#4B5563]">(avanzado)</span></label>
                <textarea
                  value={templateForm.footer_html || ''}
                  onChange={(e) => setTemplateForm({ ...templateForm, footer_html: e.target.value })}
                  className="w-full h-24 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-xs text-[#F0F2F5] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                  placeholder="<div>...</div>"
                />
              </div>
            </div>
          )}

          {/* ── CSS personalizado ── */}
          {templateSection === 'css' && (
            <div className="space-y-4">
              <p className="text-xs text-[#6B7280]">CSS personalizado que se inyecta en el documento. Usa selectores como <code className="text-[#FF6600]">.doc-header</code>, <code className="text-[#FF6600]">.doc-table</code>, etc.</p>
              <textarea
                value={templateForm.custom_css || ''}
                onChange={(e) => setTemplateForm({ ...templateForm, custom_css: e.target.value })}
                className="w-full h-64 rounded-lg bg-[#0A0D12] border border-[#2A3040] px-4 py-3 text-xs text-[#F0F2F5] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none leading-relaxed"
                placeholder={`.doc-header {\n  background: #FF6600;\n}\n\n.doc-table th {\n  font-weight: bold;\n}`}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1E2330]">
            <div>
              {editingTemplateId && !showDeleteConfirm && (
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 size={14} className="text-red-400" /> <span className="text-red-400">Eliminar</span>
                </Button>
              )}
              {editingTemplateId && showDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Confirmar eliminacion?</span>
                  <Button variant="danger" size="sm" onClick={deleteTemplate} loading={savingTemplate}>
                    Si, eliminar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                    No
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowTemplateModal(false)}>Cancelar</Button>
              <Button onClick={saveTemplate} loading={savingTemplate}>
                <Save size={14} /> {editingTemplateId ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── CREATE / EDIT STATUS MODAL ─── */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title={editingStatusId ? 'Editar estado' : 'Nuevo estado'}
        size="md"
      >
        <div className="space-y-5">
          {/* Doc type (solo al crear) */}
          {!editingStatusId && (
            <Select
              label="Tipo de documento"
              options={STATUS_DOC_TYPES}
              value={statusForm.doc_type}
              onChange={(e) => setStatusForm({ ...statusForm, doc_type: e.target.value })}
            />
          )}
          {editingStatusId && (
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Tipo de documento</label>
              <p className="text-sm text-[#F0F2F5]">{STATUS_DOC_TYPE_LABELS[statusForm.doc_type] || statusForm.doc_type}</p>
            </div>
          )}

          {/* Status key (solo al crear) */}
          {!editingStatusId && (
            <Input
              label="Clave (status_key) *"
              value={statusForm.status_key}
              onChange={(e) => setStatusForm({ ...statusForm, status_key: e.target.value })}
              placeholder="ej: en_revision, aprobado_parcial"
            />
          )}
          {editingStatusId && (
            <div>
              <label className="block text-sm font-medium text-[#9CA3AF] mb-1.5">Clave (status_key)</label>
              <p className="text-sm text-[#F0F2F5] font-mono">{statusForm.status_key}</p>
            </div>
          )}

          {/* Label */}
          <Input
            label="Etiqueta (label) *"
            value={statusForm.label}
            onChange={(e) => setStatusForm({ ...statusForm, label: e.target.value })}
            placeholder="ej: En revision"
          />

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Color</label>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="color"
                value={statusForm.color}
                onChange={(e) => setStatusForm({ ...statusForm, color: e.target.value })}
                className="w-10 h-10 rounded-lg border border-[#2A3040] bg-transparent cursor-pointer"
              />
              <Input
                value={statusForm.color}
                onChange={(e) => setStatusForm({ ...statusForm, color: e.target.value })}
                placeholder="#6B7280"
                className="flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setStatusForm({ ...statusForm, color: c })}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${
                    statusForm.color === c ? 'border-white scale-110' : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-xl bg-[#0F1218] border border-[#1E2330]">
            <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-2">Vista previa</p>
            <div className="flex items-center gap-3">
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/10"
                style={{ backgroundColor: statusForm.color }}
              />
              <span className="text-sm font-medium text-[#F0F2F5]">{statusForm.label || 'Sin etiqueta'}</span>
              <span className="text-[10px] text-[#4B5563] font-mono">
                {statusForm.status_key || 'sin_clave'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1E2330]">
            <div>
              {editingStatusId && !showDeleteStatusConfirm && (
                (() => {
                  const editingStatus = customStatuses.find(s => s.id === editingStatusId)
                  if (editingStatus?.is_system) return (
                    <span className="text-[10px] text-[#4B5563]">Los estados de sistema no se pueden eliminar</span>
                  )
                  return (
                    <Button variant="ghost" size="sm" onClick={() => setShowDeleteStatusConfirm(true)}>
                      <Trash2 size={14} className="text-red-400" /> <span className="text-red-400">Eliminar</span>
                    </Button>
                  )
                })()
              )}
              {editingStatusId && showDeleteStatusConfirm && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">Confirmar eliminacion?</span>
                  <Button variant="danger" size="sm" onClick={deleteStatus} loading={savingStatus}>
                    Si, eliminar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteStatusConfirm(false)}>
                    No
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowStatusModal(false)}>Cancelar</Button>
              <Button onClick={saveStatus} loading={savingStatus}>
                <Save size={14} /> {editingStatusId ? 'Guardar cambios' : 'Crear estado'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
