'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * Página a la que llega el usuario al hacer click en el link del email
 * de recuperación de contraseña que mandó Supabase.
 *
 * El SDK de Supabase lee automáticamente el `access_token` del fragment
 * (#access_token=...) cuando carga la página y crea una sesión "recovery".
 * En esa sesión podemos llamar `updateUser({ password })` para setear la
 * contraseña nueva.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  // Esperar a que Supabase procese el token del email y emita el evento
  // PASSWORD_RECOVERY. Si el evento no llega en pocos segundos significa que
  // el link es inválido o expiró.
  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setRecoveryReady(true)
      }
    })

    // Si el user ya tenía una sesión activa (rare pero posible), también permitir
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true)
    })

    return () => { sub.subscription.unsubscribe() }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña tiene que tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message || 'No pudimos actualizar la contraseña. Pedí un link nuevo.')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/'), 2000)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E13] px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FF6600]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#FF6600]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FF6600] mb-4 shadow-lg shadow-orange-500/20">
            <span className="text-white font-bold text-3xl italic" style={{ fontFamily: 'Georgia, serif' }}>M</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F0F2F5]">Mocciaro Soft</h1>
          <p className="text-[#6B7280] mt-1">Sistema de Gestión Integral</p>
        </div>

        <div className="bg-[#141820] border border-[#1E2330] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-[#F0F2F5] mb-6">
            Crear contraseña nueva
          </h2>

          {success ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-emerald-400 font-semibold">Contraseña actualizada</p>
                <p className="text-xs text-emerald-400/80 mt-0.5">Te llevamos al dashboard…</p>
              </div>
            </div>
          ) : !recoveryReady ? (
            <p className="text-sm text-[#9CA3AF]">Validando link de recuperación…</p>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Contraseña nueva"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={18} />}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirmar contraseña"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  icon={<Lock size={18} />}
                  required
                  minLength={8}
                />
                <Button type="submit" loading={loading} className="w-full mt-2">
                  Guardar contraseña
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-xs text-[#4B5563] mt-6">
            Grupo Mocciaro &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
