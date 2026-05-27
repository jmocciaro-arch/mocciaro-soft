'use client'

/**
 * DocumentContactsPanel — Cabecera del cliente (empresa) + lista de contactos
 * involucrados en el documento con su rol.
 *
 * Reusable: hoy lo monta el cotizador, mañana también pedido/albarán/factura.
 * No conoce el tipo de documento ni cómo se persiste — recibe el estado y
 * notifica cambios al padre por callback.
 *
 * Modo lectura: si `readOnly`, solo muestra; sin botones de agregar/quitar.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SearchBar } from '@/components/ui/search-bar'
import { User, X, Plus, Building2, Mail, Phone } from 'lucide-react'
import type { Client } from '@/types'
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  clientCompanyName,
  clientLikelyContactName,
  type ParticipantContact,
  type ParticipantRole,
  type ContactSnippet,
} from '@/lib/document-contacts'

interface Props {
  // Cliente seleccionado (empresa). Si null, muestra el buscador.
  selectedClient: Client | null
  onClearClient?: () => void
  // Búsqueda de cliente — el padre maneja el dropdown porque ya tiene cache.
  clientSearch: string
  onClientSearchChange: (q: string) => void
  clientSearchSlot?: React.ReactNode
  // Contactos vinculados al documento (con rol)
  participants: ParticipantContact[]
  onParticipantsChange: (next: ParticipantContact[]) => void
  // Modo lectura (vista de detalle de cotización ya guardada)
  readOnly?: boolean
}

export function DocumentContactsPanel({
  selectedClient,
  onClearClient,
  clientSearch,
  onClientSearchChange,
  clientSearchSlot,
  participants,
  onParticipantsChange,
  readOnly = false,
}: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [contacts, setContacts] = useState<ContactSnippet[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  // Reset al cambiar de cliente
  useEffect(() => {
    if (!selectedClient) {
      setContacts([])
      return
    }
  }, [selectedClient?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carga contactos del cliente cuando se abre el modal.
  // Cachea hasta que cambie el cliente — un cliente puede tener 10-50 contactos.
  const loadContacts = useCallback(async () => {
    if (!selectedClient?.id || contacts.length > 0) return
    setLoading(true)
    try {
      const r = await fetch(`/api/clients/${selectedClient.id}/contacts`)
      const j = await r.json()
      if (r.ok) setContacts((j.data || []) as ContactSnippet[])
    } finally {
      setLoading(false)
    }
  }, [selectedClient?.id, contacts.length])

  useEffect(() => {
    if (addOpen) void loadContacts()
  }, [addOpen, loadContacts])

  function addParticipant(contact: ContactSnippet, role: ParticipantRole) {
    // No duplicar si ya está vinculado con el mismo rol
    if (participants.some((p) => p.contact_id === contact.id && p.role === role)) return
    onParticipantsChange([
      ...participants,
      {
        contact_id: contact.id,
        role,
        name_snapshot: contact.name,
        email_snapshot: contact.email,
      },
    ])
  }

  function removeParticipant(idx: number) {
    onParticipantsChange(participants.filter((_, i) => i !== idx))
  }

  const filteredContacts = filter.trim()
    ? contacts.filter((c) => {
        const q = filter.trim().toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.position || '').toLowerCase().includes(q)
        )
      })
    : contacts

  // ───────────────────────────────────────────────────────────────────────
  // Sin cliente seleccionado: solo mostramos el buscador del padre
  // ───────────────────────────────────────────────────────────────────────
  if (!selectedClient) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 size={16} className="text-[#FF6600]" /> Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientSearchSlot ?? (
            <SearchBar
              placeholder="Buscar cliente por nombre, CUIT, email..."
              value={clientSearch}
              onChange={onClientSearchChange}
            />
          )}
        </CardContent>
      </Card>
    )
  }

  const companyName = clientCompanyName(selectedClient)
  const likelyContact = clientLikelyContactName(selectedClient)
  const taxId = (selectedClient as { tax_id?: string }).tax_id

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 size={16} className="text-[#FF6600]" /> Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ─── Empresa cliente (cabecera) ─── */}
        <div className="flex items-start justify-between p-3 rounded-lg bg-[#0F1218] border border-[#1E2330]">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#F0F2F5] truncate">{companyName}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6B7280] mt-0.5">
              {taxId && <span>CUIT/CIF: {taxId}</span>}
              {likelyContact && (
                <span className="text-amber-400/80" title="El campo 'name' del cliente parece nombre de persona. Probablemente debería ser un contacto.">
                  ⚠ name: {likelyContact}
                </span>
              )}
            </div>
          </div>
          {!readOnly && onClearClient && (
            <button
              onClick={onClearClient}
              className="text-[#6B7280] hover:text-red-400 ml-2 shrink-0"
              aria-label="Cambiar cliente"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ─── Contactos involucrados ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-[#6B7280] font-semibold">
              Contactos involucrados {participants.length > 0 && <span className="text-[#9CA3AF]">({participants.length})</span>}
            </p>
            {!readOnly && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1 text-[11px] text-[#FF6600] hover:text-orange-400 font-medium"
              >
                <Plus size={12} /> Agregar
              </button>
            )}
          </div>

          {participants.length === 0 ? (
            <div className="text-[11px] text-[#4B5563] italic px-1 py-2">
              Sin contactos vinculados. {!readOnly && 'Agregá Compras, Logística, Finanzas, etc.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {participants.map((p, idx) => {
                const roleInfo = ROLE_LABEL[p.role]
                return (
                  <li
                    key={`${p.contact_id}-${p.role}-${idx}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#0F1218]/50 border border-[#1E2330] text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-base shrink-0" title={roleInfo.label}>
                        {roleInfo.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[#F0F2F5] truncate">
                          <span className="text-[#9CA3AF] text-[10px] uppercase tracking-wide">{roleInfo.label}:</span>{' '}
                          {p.name_snapshot}
                        </p>
                        {p.email_snapshot && (
                          <p className="text-[10px] text-[#6B7280] truncate">{p.email_snapshot}</p>
                        )}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => removeParticipant(idx)}
                        className="text-[#4B5563] hover:text-red-400 shrink-0"
                        aria-label="Quitar contacto"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>

      {/* ─── Modal agregar contacto ─── */}
      {addOpen && (
        <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Agregar contacto al documento" size="lg">
          <div className="space-y-3">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar por nombre, email o cargo..."
              className="w-full rounded-lg bg-[#0F1218] border border-[#1E2330] px-3 py-2 text-sm text-[#F0F2F5] focus:outline-none focus:border-[#FF6600]"
              autoFocus
            />

            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--sat-br, #2A3040)', maxHeight: 360 }}>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-xs text-[#6B7280]">Cargando contactos…</div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-[#6B7280]">
                  {filter ? 'Sin resultados para el filtro' : 'Este cliente no tiene contactos cargados'}
                </div>
              ) : (
                <ul className="divide-y divide-[#1E2330]/40 overflow-y-auto" style={{ maxHeight: 360 }}>
                  {filteredContacts.map((c) => (
                    <li key={c.id} className="px-3 py-2 hover:bg-[#1E2330]/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <User size={14} className="text-[#6B7280] mt-1 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[#F0F2F5] truncate">
                              {c.name}
                              {c.is_primary && (
                                <span className="ml-2 text-[9px] uppercase tracking-wide text-[#FF6600] bg-orange-500/10 px-1.5 py-0.5 rounded">
                                  Principal
                                </span>
                              )}
                            </p>
                            {c.position && (
                              <p className="text-[11px] text-[#9CA3AF] truncate">{c.position}</p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#6B7280] mt-0.5">
                              {c.email && (
                                <span className="flex items-center gap-0.5">
                                  <Mail size={9} /> {c.email}
                                </span>
                              )}
                              {c.phone && (
                                <span className="flex items-center gap-0.5">
                                  <Phone size={9} /> {c.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Botones de rol — uno por rol disponible */}
                        <div className="flex flex-wrap gap-1 shrink-0 max-w-[260px] justify-end">
                          {ROLE_OPTIONS.map((r) => {
                            const already = participants.some((p) => p.contact_id === c.id && p.role === r.key)
                            // Si el contacto tiene default_roles que coincide, lo destacamos
                            const isDefault = (c.default_roles || []).includes(r.key)
                            return (
                              <button
                                key={r.key}
                                disabled={already}
                                onClick={() => {
                                  addParticipant(c, r.key)
                                  setAddOpen(false)
                                  setFilter('')
                                }}
                                title={`${r.label} — ${r.description}`}
                                className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                  already
                                    ? 'opacity-30 cursor-not-allowed border-[#2A3040] text-[#6B7280]'
                                    : isDefault
                                      ? 'border-orange-500/50 text-orange-300 hover:bg-orange-500/10'
                                      : 'border-[#2A3040] text-[#9CA3AF] hover:border-[#FF6600] hover:text-[#FF6600]'
                                }`}
                              >
                                {r.emoji} {r.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-between items-center pt-1">
              <p className="text-[10px] text-[#6B7280]">
                Tocá un rol para vincular el contacto · Los <span className="text-orange-300">resaltados</span> son sus roles por defecto
              </p>
              <Button variant="secondary" onClick={() => setAddOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
