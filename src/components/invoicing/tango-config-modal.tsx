'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
  onSaved?: () => void
}

/**
 * Modal para setear/actualizar las credenciales Tango Factura de una empresa.
 */
export function TangoConfigModal({ open, onClose, companyId, onSaved }: Props) {
  const [userIdentifier, setUserIdentifier] = useState('')
  const [applicationPublicKey, setApplicationPublicKey] = useState('')
  const [perfilComprobanteId, setPerfilComprobanteId] = useState('')
  const [puntoVentaDefault, setPuntoVentaDefault] = useState('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [existingMask, setExistingMask] = useState<{ u?: string; k?: string } | null>(null)

  useEffect(() => {
    if (!open || !companyId) return
    fetch(`/api/invoices/tango/config?companyId=${companyId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.configured) {
          setExistingMask({ u: j.userIdentifierMasked, k: j.applicationPublicKeyMasked })
          if (j.perfilComprobanteId) setPerfilComprobanteId(String(j.perfilComprobanteId))
          if (j.puntoVentaDefault) setPuntoVentaDefault(String(j.puntoVentaDefault))
        }
      })
  }, [open, companyId])

  async function handleTest() {
    if (!userIdentifier || !applicationPublicKey) {
      setMsg('⚠ Ingresá las credenciales antes de probar')
      return
    }
    setTesting(true)
    setMsg('Probando conexión con Tango...')
    try {
      const res = await fetch('/api/invoices/tango/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, userIdentifier, applicationPublicKey, testConnection: true }),
      })
      const j = await res.json()
      if (res.ok) setMsg(`✓ Conexión OK (token: ${j.tokenPreview})`)
      else setMsg('✗ ' + (j.error || 'Falló el test'))
    } catch (err) {
      setMsg('✗ ' + (err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    setMsg('Guardando...')
    try {
      const res = await fetch('/api/invoices/tango/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          userIdentifier,
          applicationPublicKey,
          perfilComprobanteId: perfilComprobanteId ? Number(perfilComprobanteId) : null,
          puntoVentaDefault: puntoVentaDefault ? Number(puntoVentaDefault) : null,
        }),
      })
      const j = await res.json()
      if (res.ok) {
        setMsg('✓ Guardado')
        onSaved?.()
        setTimeout(onClose, 600)
      } else {
        setMsg('✗ ' + (j.error || 'Error al guardar'))
      }
    } catch (err) {
      setMsg('✗ ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Configurar Tango Factura API" size="md">
      <div className="space-y-3 text-sm">
        <div className="text-xs opacity-70">
          Obtenés estos datos creando una aplicación en{' '}
          <a
            href="https://www.tangofactura.com/PGR/Aplicaciones/Create"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Tango Factura Connect → Aplicaciones → Nuevo
          </a>
        </div>

        {existingMask?.u && (
          <div
            className="p-2 rounded-md text-xs"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}
          >
            Ya hay credenciales guardadas: {existingMask.u} / {existingMask.k}. Si cargás nuevas, las reemplazan.
          </div>
        )}

        <Field
          label="User Identifier"
          value={userIdentifier}
          onChange={setUserIdentifier}
          placeholder="UUID que entrega Tango al crear la app"
        />
        <Field
          label="Application Public Key"
          value={applicationPublicKey}
          onChange={setApplicationPublicKey}
          placeholder="Clave pública de la app"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="PerfilComprobanteID (opcional)"
            type="number"
            value={perfilComprobanteId}
            onChange={setPerfilComprobanteId}
            placeholder="De Perfiles de facturación"
          />
          <Field
            label="Punto Venta default (opcional)"
            type="number"
            value={puntoVentaDefault}
            onChange={setPuntoVentaDefault}
            placeholder="Ej: 1"
          />
        </div>

        {msg && (
          <div
            className="text-xs p-2 rounded-md"
            style={{
              background: msg.startsWith('✓')
                ? 'rgba(16,185,129,0.1)'
                : msg.startsWith('✗')
                ? 'rgba(239,68,68,0.1)'
                : 'rgba(249,115,22,0.1)',
            }}
          >
            {msg}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={handleTest} disabled={testing || loading}>
            {testing ? 'Probando...' : '🔌 Probar conexión'}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading || !userIdentifier || !applicationPublicKey}>
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs opacity-70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md bg-[#1E2330] border border-[#2A3040] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
      />
    </label>
  )
}
