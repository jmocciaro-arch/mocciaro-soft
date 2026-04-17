'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'

interface FormField {
  name: string
  label: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

interface FormConfig {
  id: string
  name: string
  slug: string
  fields: FormField[]
  redirect_url: string | null
  theme: {
    brand_color?: string
    logo_url?: string
    title?: string
    description?: string
  }
}

export default function PublicFormPage() {
  const params = useParams()
  const slug = params.slug as string

  const [form, setForm] = useState<FormConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/forms/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoadError(data.error)
        } else {
          setForm(data as FormConfig)
        }
      })
      .catch(() => setLoadError('No se pudo cargar el formulario'))
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSubmitting(true)
    setSubmitError(null)

    const res = await fetch(`/api/forms/${slug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const data = await res.json() as { success?: boolean; error?: string; redirect?: string | null }

    if (data.success) {
      if (data.redirect) {
        window.location.href = data.redirect
      } else {
        setSubmitted(true)
      }
    } else {
      setSubmitError(data.error ?? 'Error al enviar el formulario')
    }
    setSubmitting(false)
  }

  const brandColor = form?.theme?.brand_color ?? '#f97316'

  // Estado de carga
  if (!form && !loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  // Error de carga
  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Formulario no disponible</h2>
          <p className="text-gray-500">{loadError}</p>
        </div>
      </div>
    )
  }

  // Estado enviado
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${brandColor}20` }}
          >
            <CheckCircle size={32} style={{ color: brandColor }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Recibimos tu consulta!
          </h2>
          <p className="text-gray-500">
            Nos ponemos en contacto a la brevedad.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-lg">
        {/* Header card */}
        <div
          className="rounded-t-2xl px-8 pt-8 pb-6 text-white"
          style={{ backgroundColor: brandColor }}
        >
          {form!.theme.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form!.theme.logo_url} alt="Logo" className="h-10 mb-4 object-contain" />
          )}
          <h1 className="text-2xl font-bold">
            {form!.theme.title ?? form!.name}
          </h1>
          {form!.theme.description && (
            <p className="mt-1 text-sm opacity-90">{form!.theme.description}</p>
          )}
        </div>

        {/* Form card */}
        <div className="bg-white rounded-b-2xl shadow-xl px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {form!.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {field.type === 'textarea' ? (
                  <textarea
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 transition-all resize-none"
                    style={{ ['--tw-ring-color' as string]: brandColor }}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 bg-white"
                  >
                    <option value="">Seleccioná una opción...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    required={field.required}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 transition-all"
                  />
                )}
              </div>
            ))}

            {submitError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-600 text-sm">
                <AlertCircle size={16} />
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{ backgroundColor: brandColor }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? 'Enviando...' : 'Enviar'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-4">
            Powered by Mocciaro Soft
          </p>
        </div>
      </div>
    </div>
  )
}
