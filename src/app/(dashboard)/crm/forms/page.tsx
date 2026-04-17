'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyContext } from '@/lib/company-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Plus, FormInput, Copy, Trash2, ToggleLeft, ToggleRight, ExternalLink, GripVertical, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface FormField {
  name: string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

interface PublicForm {
  id: string
  company_id: string
  name: string
  slug: string
  fields: FormField[]
  redirect_url: string | null
  auto_score: boolean
  auto_sequence_id: string | null
  is_active: boolean
  submissions_count: number
  theme: {
    brand_color?: string
    logo_url?: string
    title?: string
    description?: string
  }
  created_at: string
}

const FIELD_TYPE_LABELS = {
  text: 'Texto',
  email: 'Email',
  phone: 'Teléfono',
  textarea: 'Texto largo',
  select: 'Selector',
}

const DEFAULT_FIELDS: FormField[] = [
  { name: 'name', label: 'Nombre completo', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'phone', label: 'Teléfono', type: 'phone', required: false },
  { name: 'company', label: 'Empresa', type: 'text', required: false },
]

export default function FormsPage() {
  const supabase = createClient()
  const { visibleCompanies } = useCompanyContext()
  const { addToast } = useToast()
  const [forms, setForms] = useState<PublicForm[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [embedOpen, setEmbedOpen] = useState<PublicForm | null>(null)
  const [saving, setSaving] = useState(false)

  // Form builder state
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newFields, setNewFields] = useState<FormField[]>(DEFAULT_FIELDS)
  const [newRedirect, setNewRedirect] = useState('')
  const [newAutoScore, setNewAutoScore] = useState(true)
  const [newThemeColor, setNewThemeColor] = useState('#f97316')
  const [newThemeTitle, setNewThemeTitle] = useState('')
  const [newThemeDesc, setNewThemeDesc] = useState('')

  const companyIds = visibleCompanies.map((c) => c.id)

  const load = useCallback(async () => {
    if (companyIds.length === 0) return
    setLoading(true)
    const { data } = await supabase
      .from('tt_public_forms')
      .select('*')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
    setForms((data as PublicForm[]) ?? [])
    setLoading(false)
  }, [companyIds, supabase])

  useEffect(() => {
    load()
  }, [load])

  function slugify(text: string) {
    return text
      .toLowerCase()
      .replace(/[áàä]/g, 'a')
      .replace(/[éèë]/g, 'e')
      .replace(/[íìï]/g, 'i')
      .replace(/[óòö]/g, 'o')
      .replace(/[úùü]/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async function handleCreate() {
    if (!newName.trim() || !newSlug.trim() || companyIds.length === 0) return
    setSaving(true)
    const companyId = companyIds[0]
    const { error } = await supabase.from('tt_public_forms').insert({
      company_id: companyId,
      name: newName.trim(),
      slug: newSlug.trim(),
      fields: newFields,
      redirect_url: newRedirect.trim() || null,
      auto_score: newAutoScore,
      is_active: true,
      theme: {
        brand_color: newThemeColor,
        title: newThemeTitle || newName,
        description: newThemeDesc,
      },
    })
    if (!error) {
      setNewOpen(false)
      resetForm()
      await load()
      addToast({ type: 'success', title: 'Formulario creado exitosamente' })
    } else {
      addToast({ type: 'error', title: error.message })
    }
    setSaving(false)
  }

  function resetForm() {
    setNewName('')
    setNewSlug('')
    setNewFields(DEFAULT_FIELDS)
    setNewRedirect('')
    setNewAutoScore(true)
    setNewThemeColor('#f97316')
    setNewThemeTitle('')
    setNewThemeDesc('')
  }

  async function handleToggle(form: PublicForm) {
    await supabase
      .from('tt_public_forms')
      .update({ is_active: !form.is_active })
      .eq('id', form.id)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminás este formulario?')) return
    await supabase.from('tt_public_forms').delete().eq('id', id)
    await load()
  }

  function addField() {
    setNewFields([
      ...newFields,
      {
        name: `campo_${newFields.length + 1}`,
        label: 'Nuevo campo',
        type: 'text',
        required: false,
      },
    ])
  }

  function removeField(index: number) {
    setNewFields(newFields.filter((_, i) => i !== index))
  }

  function updateField(index: number, updates: Partial<FormField>) {
    setNewFields(newFields.map((f, i) => (i === index ? { ...f, ...updates } : f)))
  }

  function getPublicUrl(slug: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    return `${base}/forms/${slug}`
  }

  function getEmbedCode(slug: string) {
    const url = getPublicUrl(slug)
    return `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border-radius:8px;"></iframe>`
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    addToast({ type: 'success', title: `${label} copiado al portapapeles` })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Formularios Públicos</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Capturá leads con formularios embebibles en tu web
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={16} />
          Nuevo formulario
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <Card>
          <CardContent className="pt-5">
            <div className="text-center text-[#6B7280] py-8">Cargando formularios...</div>
          </CardContent>
        </Card>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="text-center py-12">
              <FormInput size={40} className="text-[#2A3040] mx-auto mb-3" />
              <p className="text-[#6B7280]">No tenés formularios creados</p>
              <Button className="mt-4" onClick={() => setNewOpen(true)}>
                <Plus size={16} /> Crear primer formulario
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-[#F0F2F5]">{form.name}</h3>
                    <Badge variant={form.is_active ? 'success' : 'default'}>
                      {form.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {form.auto_score && <Badge variant="orange">IA Score</Badge>}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    /forms/{form.slug} · {form.fields.length} campos · {form.submissions_count} envíos
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(getPublicUrl(form.slug), '_blank')}
                    title="Ver formulario"
                  >
                    <ExternalLink size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEmbedOpen(form)}
                    title="Obtener código"
                  >
                    <Copy size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(form)}
                    title={form.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {form.is_active ? (
                      <ToggleRight size={16} className="text-green-400" />
                    ) : (
                      <ToggleLeft size={16} />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(form.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal nuevo formulario */}
      <Modal isOpen={newOpen} onClose={() => { setNewOpen(false); resetForm() }} title="Nuevo formulario" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-1">Nombre del formulario</label>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  if (!newSlug || newSlug === slugify(newName)) {
                    setNewSlug(slugify(e.target.value))
                  }
                }}
                placeholder="Ej: Contacto principal"
              />
            </div>
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-1">Slug (URL)</label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(slugify(e.target.value))}
                placeholder="contacto-principal"
              />
              <p className="text-[10px] text-[#6B7280] mt-1">/forms/{newSlug || 'slug'}</p>
            </div>
          </div>

          {/* Tema */}
          <div className="border border-[#2A3040] rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-[#F0F2F5]">Branding del formulario</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Título visible</label>
                <Input value={newThemeTitle} onChange={(e) => setNewThemeTitle(e.target.value)} placeholder={newName || 'Título'} />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Color de marca</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newThemeColor}
                    onChange={(e) => setNewThemeColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <Input value={newThemeColor} onChange={(e) => setNewThemeColor(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1">Descripción</label>
              <Input value={newThemeDesc} onChange={(e) => setNewThemeDesc(e.target.value)} placeholder="Completá el formulario y nos ponemos en contacto" />
            </div>
          </div>

          {/* Campos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#F0F2F5]">Campos del formulario</label>
              <Button variant="ghost" size="sm" onClick={addField}>
                <Plus size={14} /> Agregar campo
              </Button>
            </div>
            <div className="space-y-2">
              {newFields.map((field, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-[#1E2330] border border-[#2A3040]">
                  <GripVertical size={16} className="text-[#4B5563] shrink-0" />
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value, name: slugify(e.target.value) || field.name })}
                    placeholder="Etiqueta"
                    className="flex-1"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FormField['type'] })}
                    className="h-10 px-2 rounded-lg bg-[#0F1218] border border-[#2A3040] text-[#F0F2F5] text-sm focus:outline-none"
                  >
                    {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-[#9CA3AF] shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                      className="rounded"
                    />
                    Req.
                  </label>
                  <button onClick={() => removeField(i)} className="text-[#4B5563] hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Opciones */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-1">URL de redirección (opcional)</label>
              <Input
                value={newRedirect}
                onChange={(e) => setNewRedirect(e.target.value)}
                placeholder="https://tusite.com/gracias"
              />
            </div>
            <div className="flex items-center gap-3 mt-6">
              <input
                type="checkbox"
                id="autoScore"
                checked={newAutoScore}
                onChange={(e) => setNewAutoScore(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="autoScore" className="text-sm text-[#9CA3AF]">
                Score automático con IA
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setNewOpen(false); resetForm() }}>Cancelar</Button>
            <Button onClick={handleCreate} loading={saving} disabled={!newName.trim() || !newSlug.trim()}>
              Crear formulario
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal embed */}
      <Modal isOpen={!!embedOpen} onClose={() => setEmbedOpen(null)} title="Compartir formulario" size="lg">
        {embedOpen && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-2">URL pública</label>
              <div className="flex gap-2">
                <Input value={getPublicUrl(embedOpen.slug)} readOnly />
                <Button variant="secondary" size="sm" onClick={() => copyToClipboard(getPublicUrl(embedOpen.slug), 'URL')}>
                  <Copy size={14} />
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#9CA3AF] mb-2">Código embed (iframe)</label>
              <div className="relative">
                <pre className="bg-[#0F1218] border border-[#2A3040] rounded-lg p-3 text-xs text-[#9CA3AF] overflow-x-auto whitespace-pre-wrap">
                  {getEmbedCode(embedOpen.slug)}
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(getEmbedCode(embedOpen.slug), 'Código embed')}
                >
                  <Copy size={12} />
                </Button>
              </div>
            </div>
            <Button variant="secondary" onClick={() => window.open(getPublicUrl(embedOpen.slug), '_blank')}>
              <ExternalLink size={14} /> Abrir en nueva pestaña
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
