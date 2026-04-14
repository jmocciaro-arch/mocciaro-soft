'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { getInitials, formatRelative } from '@/lib/utils'
import {
  Mail, Phone, Edit3, Save, Star, Trash2, ChevronDown, ChevronUp,
  MessageSquare, User, Building2, Clock, Briefcase, Globe, Calendar,
  ExternalLink, Tag,
} from 'lucide-react'

type Row = Record<string, unknown>

interface ContactCardProps {
  contact: Row
  onUpdate: () => void
  onDelete: (id: string) => void
  onTogglePrimary: (id: string) => void
}

const CONTACT_ROLES: Array<{ value: string; label: string; color: string }> = [
  { value: 'cotizacion', label: 'Cotizaciones', color: '#F59E0B' },
  { value: 'factura', label: 'Facturas', color: '#EF4444' },
  { value: 'remito', label: 'Remitos', color: '#3B82F6' },
  { value: 'pagos', label: 'Pagos', color: '#10B981' },
  { value: 'reclamo', label: 'Reclamos', color: '#F97316' },
  { value: 'mantenimiento', label: 'Mantenimiento', color: '#14B8A6' },
  { value: 'logistica', label: 'Logistica', color: '#8B5CF6' },
]

export function ContactCard({ contact, onUpdate, onDelete, onTogglePrimary }: ContactCardProps) {
  const { addToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Row[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const id = contact.id as string
  const name = (contact.name as string) || ''
  const email = (contact.email as string) || ''
  const position = (contact.position as string) || ''
  const phone = (contact.phone as string) || ''
  const whatsapp = (contact.whatsapp as string) || ''
  const personalEmail = (contact.personal_email as string) || ''
  const personalPhone = (contact.personal_phone as string) || ''
  const personalWhatsapp = (contact.personal_whatsapp as string) || ''
  const birthday = (contact.birthday as string) || ''
  const notes = (contact.notes as string) || ''
  const linkedin = (contact.linkedin as string) || ''
  const isFavorite = (contact.is_favorite as boolean) || (contact.is_primary as boolean) || false
  const defaultRoles = (contact.default_roles as string[]) || []
  const source = (contact.source as string) || 'db'

  const startEdit = () => {
    setEditData({
      name, position, email, phone, whatsapp,
      personal_email: personalEmail,
      personal_phone: personalPhone,
      personal_whatsapp: personalWhatsapp,
      birthday, notes, linkedin,
    })
    setEditRoles([...defaultRoles])
    setEditing(true)
    setExpanded(true)
  }

  const toggleRole = (role: string) => {
    setEditRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  const saveEdit = async () => {
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.from('tt_client_contacts').update({
      name: editData.name,
      position: editData.position,
      email: editData.email,
      phone: editData.phone,
      whatsapp: editData.whatsapp,
      personal_email: editData.personal_email || null,
      personal_phone: editData.personal_phone || null,
      personal_whatsapp: editData.personal_whatsapp || null,
      birthday: editData.birthday || null,
      notes: editData.notes || null,
      linkedin: editData.linkedin || null,
      default_roles: editRoles,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) {
      addToast({ type: 'error', title: 'Error', message: error.message })
    } else {
      addToast({ type: 'success', title: 'Contacto actualizado' })
      setEditing(false)
      onUpdate()
    }
    setSaving(false)
  }

  const toggleFavorite = async () => {
    const sb = createClient()
    await sb.from('tt_client_contacts')
      .update({ is_favorite: !isFavorite })
      .eq('id', id)
    onUpdate()
  }

  const loadHistory = async () => {
    if (history.length > 0) { setShowHistory(!showHistory); return }
    setLoadingHistory(true)
    setShowHistory(true)
    const sb = createClient()
    const { data } = await sb
      .from('tt_activity_log')
      .select('*')
      .or(`description.ilike.%${email}%,description.ilike.%${name}%`)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistory(data || [])
    setLoadingHistory(false)
  }

  const getWhatsappNumber = (): string => {
    const num = personalWhatsapp || whatsapp || personalPhone || phone
    return num.replace(/[^0-9+]/g, '')
  }

  const hasPersonalData = personalEmail || personalPhone || personalWhatsapp || birthday || linkedin

  return (
    <div className={`border rounded-xl overflow-hidden bg-[#141820] transition-all ${
      isFavorite ? 'border-amber-500/30 ring-1 ring-amber-500/10' : 'border-[#2A3040]'
    }`}>
      {/* ── Main Row ── */}
      <div className="flex items-center gap-3 p-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-[#1E2330] flex items-center justify-center text-sm font-bold text-[#FF6600] shrink-0 relative">
          {getInitials(name)}
          {isFavorite && (
            <Star size={10} className="absolute -top-1 -right-1 text-amber-400 fill-amber-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#F0F2F5]">{name}</span>
            {source === 'inline' && <Badge variant="default" size="sm">StelOrder</Badge>}
            {source === 'gmail' && <Badge variant="info" size="sm">Gmail</Badge>}
            {/* Role badges */}
            {defaultRoles.map(role => {
              const roleInfo = CONTACT_ROLES.find(r => r.value === role)
              if (!roleInfo) return null
              return (
                <span
                  key={role}
                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: roleInfo.color + '20', color: roleInfo.color }}
                >
                  {roleInfo.label}
                </span>
              )
            })}
          </div>
          {position && <p className="text-xs text-[#6B7280] mt-0.5">{position.split('\r')[0]}</p>}
          <div className="flex gap-3 mt-1 flex-wrap">
            {email && (
              <a href={`mailto:${email}`} className="text-xs text-[#9CA3AF] flex items-center gap-1 hover:text-[#FF6600] transition-colors">
                <Mail size={10} />{email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="text-xs text-[#9CA3AF] flex items-center gap-1 hover:text-[#FF6600] transition-colors">
                <Phone size={10} />{phone}
              </a>
            )}
          </div>
        </div>

        {/* WhatsApp Buttons — grandes con texto */}
        {getWhatsappNumber() && (
          <div className="flex gap-2 shrink-0">
            <a
              href={`https://wa.me/${getWhatsappNumber()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
              title="Abre WhatsApp (app si esta instalada, sino Web)"
            >
              <MessageSquare size={16} />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
            <a
              href={`https://web.whatsapp.com/send?phone=${getWhatsappNumber()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 h-9 rounded-lg bg-emerald-600/10 border border-emerald-600/30 text-emerald-500 text-xs font-semibold hover:bg-emerald-600/20 transition-all"
              title="Fuerza WhatsApp Web"
            >
              <Globe size={16} />
              <span className="hidden sm:inline">Web</span>
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1 shrink-0">
          <button
            onClick={toggleFavorite}
            className={`p-2 rounded-lg transition-colors ${
              isFavorite
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-[#6B7280] hover:bg-[#1E2330] hover:text-amber-400'
            }`}
            title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            <Star size={16} className={isFavorite ? 'fill-amber-400' : ''} />
          </button>
          <button onClick={startEdit} className="p-2 rounded-lg hover:bg-[#1E2330] text-[#6B7280] hover:text-[#FF6600] transition-colors" title="Editar">
            <Edit3 size={14} />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-lg hover:bg-[#1E2330] text-[#6B7280] transition-colors" title="Expandir">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Expanded Section ── */}
      {expanded && !editing && (
        <div className="border-t border-[#1E2330] px-4 pb-4 space-y-4">
          {/* Roles predefinidos */}
          {defaultRoles.length > 0 && (
            <div className="pt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2 flex items-center gap-1">
                <Tag size={10} /> Roles predefinidos
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {defaultRoles.map(role => {
                  const roleInfo = CONTACT_ROLES.find(r => r.value === role)
                  if (!roleInfo) return null
                  return (
                    <span
                      key={role}
                      className="text-xs font-medium px-2 py-1 rounded border"
                      style={{
                        backgroundColor: roleInfo.color + '15',
                        borderColor: roleInfo.color + '40',
                        color: roleInfo.color,
                      }}
                    >
                      {roleInfo.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Datos empresa */}
          <div className="pt-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2 flex items-center gap-1">
              <Building2 size={10} /> Datos de empresa (Gmail)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <DataPill icon={<Mail size={10} />} label="Email" value={email} />
              <DataPill icon={<Briefcase size={10} />} label="Cargo" value={position.split('\r')[0]} />
              <DataPill icon={<Phone size={10} />} label="Telefono" value={phone} />
              <DataPill icon={<MessageSquare size={10} />} label="WhatsApp" value={whatsapp} />
            </div>
          </div>

          {/* Datos personales */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-2 flex items-center gap-1">
              <User size={10} /> Datos personales (manual)
            </h4>
            {hasPersonalData ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <DataPill icon={<Mail size={10} />} label="Email personal" value={personalEmail} />
                <DataPill icon={<Phone size={10} />} label="Celular" value={personalPhone} />
                <DataPill icon={<MessageSquare size={10} />} label="WhatsApp" value={personalWhatsapp} />
                <DataPill icon={<Calendar size={10} />} label="Cumpleaños" value={birthday} />
                {linkedin && (
                  <a href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <ExternalLink size={10} /> LinkedIn
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#4B5563]">Sin datos personales. Hace clic en editar para cargar.</p>
            )}
          </div>

          {/* Notas */}
          {notes && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1">Notas</h4>
              <p className="text-xs text-[#9CA3AF] whitespace-pre-wrap bg-[#0F1218] rounded-lg p-2 border border-[#1E2330]">{notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[#1E2330]">
            <button onClick={loadHistory} className="text-xs text-[#6B7280] hover:text-[#FF6600] flex items-center gap-1 transition-colors">
              <Clock size={12} /> {showHistory ? 'Ocultar historial' : 'Ver historial'}
            </button>
            <button onClick={() => onDelete(id)} className="text-xs text-red-400/60 hover:text-red-400 flex items-center gap-1 transition-colors">
              <Trash2 size={12} /> Eliminar
            </button>
          </div>

          {showHistory && (
            <div className="space-y-1">
              {loadingHistory ? (
                <p className="text-xs text-[#6B7280] text-center py-2">Buscando...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-[#4B5563] text-center py-2">Sin actividad registrada</p>
              ) : (
                history.map((h) => (
                  <div key={h.id as string} className="flex gap-2 p-2 rounded bg-[#0F1218] border border-[#1E2330]">
                    <Clock size={10} className="text-[#4B5563] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] text-[#9CA3AF]">{(h.description as string) || (h.action as string)}</p>
                      <p className="text-[10px] text-[#4B5563]">{h.created_at ? formatRelative(h.created_at as string) : ''}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Edit Mode ── */}
      {editing && (
        <div className="border-t border-[#1E2330] px-4 pb-4 pt-3 space-y-4">
          {/* Roles predefinidos */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#FF6600] mb-2 flex items-center gap-1">
              <Tag size={10} /> Roles predefinidos
            </h4>
            <p className="text-[11px] text-[#6B7280] mb-2">
              Marca los documentos que se envian a este contacto por defecto
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {CONTACT_ROLES.map(role => {
                const isSelected = editRoles.includes(role.value)
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => toggleRole(role.value)}
                    className="px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left"
                    style={{
                      backgroundColor: isSelected ? role.color + '20' : 'transparent',
                      borderColor: isSelected ? role.color : '#2A3040',
                      color: isSelected ? role.color : '#9CA3AF',
                    }}
                  >
                    {isSelected ? '✓ ' : ''}{role.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Empresa */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#FF6600] mb-2">Datos de empresa</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nombre" value={editData.name || ''} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
              <Input label="Cargo" value={editData.position || ''} onChange={(e) => setEditData({ ...editData, position: e.target.value })} />
              <Input label="Email corporativo" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
              <Input label="Telefono oficina" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
              <Input label="WhatsApp empresa" value={editData.whatsapp || ''} onChange={(e) => setEditData({ ...editData, whatsapp: e.target.value })} />
            </div>
          </div>

          {/* Personal */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#14B8A6] mb-2">Datos personales (no se pisan con Gmail)</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email personal" value={editData.personal_email || ''} onChange={(e) => setEditData({ ...editData, personal_email: e.target.value })} />
              <Input label="Celular personal" value={editData.personal_phone || ''} onChange={(e) => setEditData({ ...editData, personal_phone: e.target.value })} />
              <Input label="WhatsApp personal" value={editData.personal_whatsapp || ''} onChange={(e) => setEditData({ ...editData, personal_whatsapp: e.target.value })} />
              <Input label="Cumpleaños" value={editData.birthday || ''} onChange={(e) => setEditData({ ...editData, birthday: e.target.value })} placeholder="ej: 15/03" />
              <Input label="LinkedIn" value={editData.linkedin || ''} onChange={(e) => setEditData({ ...editData, linkedin: e.target.value })} placeholder="linkedin.com/in/..." />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">Notas</label>
            <textarea
              value={editData.notes || ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              className="w-full h-16 rounded-lg bg-[#1E2330] border border-[#2A3040] px-3 py-2 text-xs text-[#F0F2F5] placeholder:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Notas sobre el contacto..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" size="sm" onClick={saveEdit} loading={saving}><Save size={12} /> Guardar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DataPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return (
    <span className="text-[11px] text-[#4B5563] flex items-center gap-1">
      {icon} Sin {label.toLowerCase()}
    </span>
  )
  return (
    <span className="text-[11px] text-[#D1D5DB] flex items-center gap-1">
      {icon} {value}
    </span>
  )
}
